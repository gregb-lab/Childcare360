// ─── AUTH MODULE — Login, Register, MFA, Tenant Picker, Password Reset ───────
// Multi-tenant authentication UI for Childcare360
// ────────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, createContext, useContext, useCallback } from "react";

// ─── AUTH CONTEXT ───────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// ─── API HELPER ─────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const token = localStorage.getItem("c360_token");
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.code === "TOKEN_EXPIRED") {
      const refreshed = await refreshTokens();
      if (refreshed) return api(path, opts); // Retry
    }
    throw { status: res.status, ...data };
  }
  return data;
}

async function refreshTokens() {
  const rt = localStorage.getItem("c360_refresh");
  if (!rt) return false;
  try {
    const res = await fetch("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("c360_token", data.accessToken);
    localStorage.setItem("c360_refresh", data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export { api };

// ─── AUTH PROVIDER ──────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [currentTenant, setCurrentTenant] = useState(null);
  const [platformRole, setPlatformRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState("login"); // login, register, verify-email, mfa, forgot-password, reset-password, setup-org, pick-tenant
  const [pendingMfa, setPendingMfa] = useState(null);
  const [pendingVerify, setPendingVerify] = useState(null);

  // Restore session on mount — optimistic: show app immediately if token exists
  useEffect(() => {
    const token = localStorage.getItem("c360_token");
    const storedPlatformRole = localStorage.getItem("c360_platform_role");
    const storedTenant = localStorage.getItem("c360_tenant");
    if (storedPlatformRole) setPlatformRole(storedPlatformRole);
    if (!token) { setLoading(false); return; }
    // Optimistically restore from localStorage so app shows instantly
    if (storedTenant) {
      setCurrentTenant({ id: storedTenant, role: localStorage.getItem("c360_role") || "admin" });
    }
    setLoading(false); // Show app immediately
    // Verify token in background — silently log out if invalid
    api("/api/me").then(data => {
      setUser(data.user);
      if (data.membership) {
        const tid = storedTenant;
        if (tid) {
          setCurrentTenant({ id: tid, role: data.membership.role });
          localStorage.setItem("c360_role", data.membership.role);
          loadTenants();
        }
      }
    }).catch(() => {
      // Token invalid — clear and go to login
      localStorage.removeItem("c360_token");
      localStorage.removeItem("c360_refresh");
      localStorage.removeItem("c360_tenant");
      localStorage.removeItem("c360_role");
      setUser(null); setCurrentTenant(null); setPlatformRole(null);
    });
  }, []);

  const loadTenants = useCallback(async () => {
    // Get tenant list from refresh
    const rt = localStorage.getItem("c360_refresh");
    if (rt) {
      try {
        const data = await api("/auth/refresh", { method: "POST", body: { refreshToken: rt } });
        localStorage.setItem("c360_token", data.accessToken);
        localStorage.setItem("c360_refresh", data.refreshToken);
        setTenants(data.tenants || []);
        if (data.currentTenant) setCurrentTenant(data.currentTenant);
      } catch {}
    }
  }, []);

  const handleAuthSuccess = (data) => {
    localStorage.setItem("c360_token", data.accessToken);
    localStorage.setItem("c360_refresh", data.refreshToken);
    setUser(data.user);
    setTenants(data.tenants || []);
    if (data.platformRole) {
      setPlatformRole(data.platformRole);
      localStorage.setItem("c360_platform_role", data.platformRole);
    }

    if (data.currentTenant) {
      localStorage.setItem("c360_tenant", data.currentTenant.id);
      setCurrentTenant(data.currentTenant);
    } else if (data.platformRole) {
      // Platform admin can proceed without a tenant
    } else if (data.tenants?.length === 0) {
      setAuthScreen("setup-org");
    } else if (data.tenants?.length > 1) {
      setAuthScreen("pick-tenant");
    } else if (data.tenants?.length === 1) {
      switchTenant(data.tenants[0].id);
    }
  };

  const switchTenant = async (tenantId) => {
    try {
      const data = await api("/auth/switch-tenant", { method: "POST", body: { tenantId } });
      localStorage.setItem("c360_token", data.accessToken);
      localStorage.setItem("c360_tenant", tenantId);
      setCurrentTenant(data.currentTenant);
    } catch (err) {
      console.error("Switch tenant failed:", err);
    }
  };

  const logout = async () => {
    try {
      const rt = localStorage.getItem("c360_refresh");
      await fetch("/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: rt }) });
    } catch {}
    ["c360_token","c360_refresh","c360_tenant","c360_platform_role","c360_role"].forEach(k => localStorage.removeItem(k));
    // Hard reload to login — ensures all React state is cleared cleanly
    window.location.href = "/";
  };

  const value = {
    user, tenants, currentTenant, loading, platformRole,
    authScreen, setAuthScreen,
    pendingMfa, setPendingMfa,
    pendingVerify, setPendingVerify,
    handleAuthSuccess, switchTenant, logout, loadTenants,
    isAdmin: currentTenant?.role === "admin" || currentTenant?.role === "director",
    isPlatformAdmin: !!platformRole,
    isAuthenticated: !!user && (!!currentTenant || !!platformRole),
  };

  // Show loading spinner while restoring session
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#F5F0EB,#EDE4F0,#F0EBE6)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Nunito, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg,#8B6DAF,#B5A0CC)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 16px" }}>🏫</div>
          <div style={{ fontSize: 13, color: "#8A7F96", fontWeight: 600 }}>Loading Childcare360…</div>
        </div>
      </div>
    );
  }

  // Show auth screens when not authenticated
  if (!value.isAuthenticated) {
    return (
      <AuthContext.Provider value={value}>
        <AuthScreenRouter />
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── STYLES ─────────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: "100vh", background: "linear-gradient(135deg, #F5F0EB 0%, #EDE4F0 50%, #F0EBE6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', -apple-system, sans-serif", color: "#3D3248" },
  card: { background: "#FFFFFF", borderRadius: 20, padding: "40px 36px", width: 420, maxWidth: "90vw", border: "1px solid #E8E0D8", boxShadow: "0 20px 60px rgba(80,60,90,0.08), 0 2px 8px rgba(80,60,90,0.04)", animation: "fadeInUp 0.5s ease-out" },
  logo: { display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginBottom: 32 },
  logoIcon: { width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #8B6DAF, #B5A0CC)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 },
  title: { margin: "0 0 6px", fontSize: 22, fontWeight: 700, textAlign: "center" },
  subtitle: { margin: "0 0 24px", fontSize: 13, color: "#8A7F96", textAlign: "center" },
  input: { width: "100%", background: "#F8F5F1", border: "1px solid #D9D0C7", borderRadius: 12, padding: "13px 16px", color: "#3D3248", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 12, transition: "border-color 0.2s, box-shadow 0.2s" },
  label: { display: "block", fontSize: 12, color: "#8A7F96", marginBottom: 4, fontWeight: 600 },
  btn: { width: "100%", padding: "14px 20px", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.25s ease", marginBottom: 10, letterSpacing: "0.01em" },
  btnPrimary: { background: "linear-gradient(135deg, #8B6DAF, #9B7DC0)", color: "#fff", boxShadow: "0 4px 14px rgba(139,109,175,0.25)" },
  btnGoogle: { background: "#fff", color: "#3D3248", border: "1px solid #D9D0C7" },
  btnApple: { background: "#1D1D1F", color: "#fff" },
  btnGhost: { background: "transparent", color: "#A88BC7", border: "none", cursor: "pointer", fontSize: 13 },
  divider: { display: "flex", alignItems: "center", gap: 12, margin: "16px 0", color: "#A89DB5", fontSize: 12 },
  dividerLine: { flex: 1, height: 1, background: "#D9D0C7" },
  error: { background: "#C9828A18", border: "1px solid #C9828A30", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#C9828A", marginBottom: 12 },
  success: { background: "#6BA38B18", border: "1px solid #6BA38B30", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#6BA38B", marginBottom: 12 },
  link: { color: "#8B6DAF", cursor: "pointer", fontSize: 13, background: "none", border: "none", textDecoration: "none", fontWeight: 600, transition: "color 0.2s" },
  codeInputWrap: { display: "flex", gap: 10, justifyContent: "center", marginBottom: 16 },
  codeInput: { width: 48, height: 56, textAlign: "center", fontSize: 24, fontWeight: 700, background: "#F8F5F1", border: "2px solid #D9D0C7", borderRadius: 12, color: "#3D3248", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s" },
  tenantCard: { background: "#FDFBF9", border: "1px solid #E8E0D8", borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "all 0.25s ease", marginBottom: 10, textAlign: "left" },
};

// ─── AUTH GATE ───────────────────────────────────────────────────────────────────
export function AuthGate({ children }) {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div style={S.page}>
        <div style={{ textAlign: "center", animation: "fadeIn 0.5s ease-out" }}>
          <div style={{ marginBottom: 16, animation: "softBounce 2s ease-in-out infinite" }}>
          <svg width="56" height="56" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="lg" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#8B6DAF"/><stop offset="100%" stopColor="#B5A0CC"/></linearGradient></defs>
            <rect width="56" height="56" rx="16" fill="url(#lg)"/>
            <circle cx="28" cy="28" r="17" stroke="white" strokeWidth="2.5" fill="none" strokeDasharray="6 3"/>
            <circle cx="28" cy="28" r="10" fill="white" fillOpacity="0.95"/>
            <text x="28" y="32" textAnchor="middle" fontSize="9" fontWeight="800" fontFamily="Nunito,sans-serif" fill="#8B6DAF">360</text>
          </svg>
        </div>
          <div style={{ fontSize: 16, color: "#8A7F96", fontWeight: 600 }}>Loading Childcare360...</div>
          <div style={{ width: 120, height: 3, borderRadius: 2, margin: "16px auto 0", background: "linear-gradient(90deg, #F8F5F1 25%, #C4AED6 50%, #F8F5F1 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s ease-in-out infinite" }} />
        </div>
      </div>
    );
  }

  if (auth.isAuthenticated) return children;

  // Show auth screens
  switch (auth.authScreen) {
    case "register": return <RegisterScreen />;
    case "verify-email": return <VerifyEmailScreen />;
    case "mfa": return <MfaScreen />;
    case "forgot-password": return <ForgotPasswordScreen />;
    case "reset-password": return <ResetPasswordScreen />;
    case "setup-org": return <SetupOrgScreen />;
    case "pick-tenant": return <TenantPickerScreen />;
    default: return <LoginScreen />;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██  LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const data = await api("/auth/login", { method: "POST", body: { email, password } });
      if (data.mfaRequired) {
        auth.setPendingMfa({ userId: data.userId, method: data.mfaMethod });
        auth.setAuthScreen("mfa");
      } else {
        auth.handleAuthSuccess(data);
      }
    } catch (err) {
      if (err.code === "EMAIL_NOT_VERIFIED") {
        auth.setPendingVerify({ userId: err.userId });
        auth.setAuthScreen("verify-email");
      } else {
        setError(err.error || "Login failed");
      }
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError("Google OAuth requires configuration. Set GOOGLE_CLIENT_ID in your .env file and add the Google Sign-In script to index.html.");
  };

  const handleAppleLogin = async () => {
    setError("Apple OAuth requires configuration. Set APPLE_CLIENT_ID in your .env file.");
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="lg2" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#8B6DAF"/><stop offset="100%" stopColor="#B5A0CC"/></linearGradient></defs>
            <rect width="44" height="44" rx="12" fill="url(#lg2)"/>
            <circle cx="22" cy="22" r="13" stroke="white" strokeWidth="2" fill="none" strokeDasharray="5 2.5"/>
            <circle cx="22" cy="22" r="8" fill="white" fillOpacity="0.95"/>
            <text x="22" y="25.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fontFamily="Nunito,sans-serif" fill="#8B6DAF">360</text>
          </svg>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>Childcare360</div>
            <div style={{ fontSize: 11, color: "#A89DB5" }}>v1.7.0 · Secure Login</div>
          </div>
        </div>

        <h2 style={S.title}>Welcome back</h2>
        <p style={S.subtitle}>Sign in to your account to continue</p>

        {error && <div style={S.error}>{error}</div>}

        <div>
          <label style={S.label}>Email address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
            style={S.input} required autoFocus onFocus={e => e.target.style.borderColor = "#8B6DAF"} onBlur={e => e.target.style.borderColor = "#D9D0C7"}
            onKeyDown={e => e.key === "Enter" && handleLogin(e)} />

          <label style={S.label}>Password</label>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" style={{ ...S.input, marginBottom: 0, paddingRight: 44 }} required
              onFocus={e => e.target.style.borderColor = "#8B6DAF"} onBlur={e => e.target.style.borderColor = "#D9D0C7"}
              onKeyDown={e => e.key === "Enter" && handleLogin(e)} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#A89DB5", cursor: "pointer", fontSize: 12 }}>
              {showPassword ? "HIDE" : "SHOW"}
            </button>
          </div>

          <div style={{ textAlign: "right", marginBottom: 16 }}>
            <button type="button" onClick={() => auth.setAuthScreen("forgot-password")} style={S.link}>Forgot password?</button>
          </div>

          <button type="button" onClick={handleLogin} disabled={loading} style={{ ...S.btn, ...S.btnPrimary, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </div>

        <div style={S.divider}>
          <div style={S.dividerLine} /><span>or continue with</span><div style={S.dividerLine} />
        </div>

        <button onClick={handleGoogleLogin} style={{ ...S.btn, ...S.btnGoogle }}>
          <span style={{ marginRight: 8 }}>🔵</span> Sign in with Google
        </button>
        <button onClick={handleAppleLogin} style={{ ...S.btn, ...S.btnApple }}>
          <span style={{ marginRight: 8 }}>🍎</span> Sign in with Apple
        </button>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#8A7F96" }}>
          Don't have an account?{" "}
          <button onClick={() => auth.setAuthScreen("register")} style={S.link}>Create account</button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██  REGISTER SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function RegisterScreen() {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordStrength = (pw) => {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  };
  const strength = passwordStrength(password);
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong", "Excellent"][strength];
  const strengthColor = ["#A89DB5", "#C9828A", "#D4A26A", "#9B7DC0", "#6BA38B", "#8B6DAF"][strength];

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const data = await api("/auth/register", { method: "POST", body: { email, password, name, phone } });
      auth.setPendingVerify({ userId: data.userId });
      auth.setAuthScreen("verify-email");
    } catch (err) {
      setError(err.error || "Registration failed");
    }
    setLoading(false);
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="lg2" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#8B6DAF"/><stop offset="100%" stopColor="#B5A0CC"/></linearGradient></defs>
            <rect width="44" height="44" rx="12" fill="url(#lg2)"/>
            <circle cx="22" cy="22" r="13" stroke="white" strokeWidth="2" fill="none" strokeDasharray="5 2.5"/>
            <circle cx="22" cy="22" r="8" fill="white" fillOpacity="0.95"/>
            <text x="22" y="25.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fontFamily="Nunito,sans-serif" fill="#8B6DAF">360</text>
          </svg>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
              <defs><linearGradient id="lg3" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#8B6DAF"/><stop offset="100%" stopColor="#B5A0CC"/></linearGradient></defs>
              <rect width="36" height="36" rx="10" fill="url(#lg3)"/>
              <circle cx="18" cy="18" r="11" stroke="white" strokeWidth="2" fill="none" strokeDasharray="4 2"/>
              <circle cx="18" cy="18" r="6.5" fill="white" fillOpacity="0.95"/>
              <text x="18" y="21.5" textAnchor="middle" fontSize="6" fontWeight="800" fontFamily="Nunito,sans-serif" fill="#8B6DAF">360</text>
            </svg>
            <div style={{ fontWeight: 700, fontSize: 20 }}>Childcare360</div>
          </div>
        </div>
        <h2 style={S.title}>Create your account</h2>
        <p style={S.subtitle}>Join Childcare360 to manage your childcare centre</p>

        {error && <div style={S.error}>{error}</div>}

        <div>
          <label style={S.label}>Full name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" style={S.input} required autoFocus />

          <label style={S.label}>Email address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@childcare.com.au" style={S.input} required />

          <label style={S.label}>Phone (optional)</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0412 345 678" style={S.input} />

          <label style={S.label}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters" style={S.input} required />
          {password && (
            <div style={{ display: "flex", gap: 4, marginBottom: 12, marginTop: -8 }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= strength ? strengthColor : "#E8E0D8" }} />
              ))}
              <span style={{ fontSize: 10, color: strengthColor, marginLeft: 8, whiteSpace: "nowrap" }}>{strengthLabel}</span>
            </div>
          )}

          <label style={S.label}>Confirm password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" style={S.input} required />

          <button type="button" disabled={loading} style={{ ...S.btn, ...S.btnPrimary, marginTop: 8, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#8A7F96" }}>
          Already have an account?{" "}
          <button onClick={() => auth.setAuthScreen("login")} style={S.link}>Sign in</button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██  EMAIL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════
function VerifyEmailScreen() {
  const auth = useAuth();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInput = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...code];
    next[i] = val;
    setCode(next);
    if (val && i < 5) document.getElementById(`vc_${i+1}`)?.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      document.getElementById("vc_5")?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 6) { setError("Enter the full 6-digit code"); return; }
    setError(""); setLoading(true);
    try {
      await api("/auth/verify-email", { method: "POST", body: { userId: auth.pendingVerify?.userId, code: fullCode } });
      setSuccess("Email verified! You can now sign in.");
      setTimeout(() => auth.setAuthScreen("login"), 2000);
    } catch (err) {
      setError(err.error || "Verification failed");
    }
    setLoading(false);
  };

  const resend = async () => {
    try {
      await api("/auth/resend-code", { method: "POST", body: { userId: auth.pendingVerify?.userId, type: "verify" } });
      setSuccess("New code sent to your email");
      setTimeout(() => setSuccess(""), 3000);
    } catch {}
  };

  return (
    <div style={S.page}>
      <div style={{ ...S.card, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
        <h2 style={S.title}>Verify your email</h2>
        <p style={S.subtitle}>We've sent a 6-digit code to your email address</p>

        {error && <div style={S.error}>{error}</div>}
        {success && <div style={S.success}>{success}</div>}

        <div style={S.codeInputWrap} onPaste={handlePaste}>
          {code.map((d, i) => (
            <input key={i} id={`vc_${i}`} value={d} onChange={e => handleInput(i, e.target.value)}
              maxLength={1} style={S.codeInput}
              onKeyDown={e => { if (e.key === "Backspace" && !d && i > 0) document.getElementById(`vc_${i-1}`)?.focus(); }}
              onFocus={e => e.target.style.borderColor = "#8B6DAF"} onBlur={e => e.target.style.borderColor = "#D9D0C7"} />
          ))}
        </div>

        <button onClick={handleVerify} disabled={loading} style={{ ...S.btn, ...S.btnPrimary, opacity: loading ? 0.6 : 1 }}>
          {loading ? "Verifying..." : "Verify Email"}
        </button>

        <div style={{ marginTop: 16, fontSize: 13, color: "#8A7F96" }}>
          Didn't receive a code?{" "}<button onClick={resend} style={S.link}>Resend code</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <button onClick={() => auth.setAuthScreen("login")} style={S.link}>← Back to login</button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██  MFA VERIFICATION (TOTP or Email Code)
// ═══════════════════════════════════════════════════════════════════════════════
function MfaScreen() {
  const auth = useAuth();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const method = auth.pendingMfa?.method || "email";

  const handleInput = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...code];
    next[i] = val;
    setCode(next);
    if (val && i < 5) document.getElementById(`mfa_${i+1}`)?.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) setCode(pasted.split(""));
  };

  const handleVerify = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 6) { setError("Enter the full 6-digit code"); return; }
    setError(""); setLoading(true);
    try {
      const data = await api("/auth/verify-mfa", { method: "POST", body: { userId: auth.pendingMfa?.userId, code: fullCode } });
      auth.handleAuthSuccess(data);
    } catch (err) {
      setError(err.error || "Invalid code");
    }
    setLoading(false);
  };

  const resend = async () => {
    if (method !== "email") return;
    try {
      await api("/auth/resend-code", { method: "POST", body: { userId: auth.pendingMfa?.userId, type: "mfa" } });
    } catch {}
  };

  return (
    <div style={S.page}>
      <div style={{ ...S.card, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{method === "totp" ? "🔐" : "📧"}</div>
        <h2 style={S.title}>Two-factor authentication</h2>
        <p style={S.subtitle}>
          {method === "totp"
            ? "Enter the code from your authenticator app"
            : "Enter the 6-digit code sent to your email"}
        </p>

        {error && <div style={S.error}>{error}</div>}

        <div style={S.codeInputWrap} onPaste={handlePaste}>
          {code.map((d, i) => (
            <input key={i} id={`mfa_${i}`} value={d} onChange={e => handleInput(i, e.target.value)}
              maxLength={1} style={S.codeInput} autoFocus={i === 0}
              onKeyDown={e => { if (e.key === "Backspace" && !d && i > 0) document.getElementById(`mfa_${i-1}`)?.focus(); }}
              onFocus={e => e.target.style.borderColor = "#8B6DAF"} onBlur={e => e.target.style.borderColor = "#D9D0C7"} />
          ))}
        </div>

        <button onClick={handleVerify} disabled={loading} style={{ ...S.btn, ...S.btnPrimary, opacity: loading ? 0.6 : 1 }}>
          {loading ? "Verifying..." : "Verify"}
        </button>

        {method === "email" && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#8A7F96" }}>
            <button onClick={resend} style={S.link}>Resend code</button>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <button onClick={() => { auth.setPendingMfa(null); auth.setAuthScreen("login"); }} style={S.link}>← Back to login</button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██  FORGOT / RESET PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════
function ForgotPasswordScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
    } catch {}
    setLoading(false);
  };

  if (sent) {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
          <h2 style={S.title}>Check your email</h2>
          <p style={S.subtitle}>If an account exists for {email}, we've sent a reset code.</p>
          <button onClick={() => { auth.setPendingVerify({ email }); auth.setAuthScreen("reset-password"); }}
            style={{ ...S.btn, ...S.btnPrimary }}>Enter reset code</button>
          <button onClick={() => auth.setAuthScreen("login")} style={{ ...S.link, marginTop: 12, display: "block" }}>← Back to login</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h2 style={S.title}>Reset password</h2>
        <p style={S.subtitle}>Enter your email and we'll send you a reset code</p>
        <div>
          <label style={S.label}>Email address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={S.input} required autoFocus />
          <button type="button" disabled={loading} style={{ ...S.btn, ...S.btnPrimary }}>
            {loading ? "Sending..." : "Send Reset Code"}
          </button>
        </div>
        <button onClick={() => auth.setAuthScreen("login")} style={{ ...S.link, display: "block", textAlign: "center", marginTop: 12 }}>← Back to login</button>
      </div>
    </div>
  );
}

function ResetPasswordScreen() {
  const auth = useAuth();
  const [code, setCodeVal] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) { setError("Passwords don't match"); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError(""); setLoading(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { email: auth.pendingVerify?.email, code: code, newPassword } });
      setSuccess("Password reset! Redirecting to login...");
      setTimeout(() => auth.setAuthScreen("login"), 2000);
    } catch (err) {
      setError(err.error || "Reset failed");
    }
    setLoading(false);
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h2 style={S.title}>Set new password</h2>
        <p style={S.subtitle}>Enter the code from your email and your new password</p>
        {error && <div style={S.error}>{error}</div>}
        {success && <div style={S.success}>{success}</div>}
        <div>
          <label style={S.label}>Reset code</label>
          <input value={code} onChange={e => setCodeVal(e.target.value)} placeholder="6-digit code" style={S.input} required />
          <label style={S.label}>New password</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 8 characters" style={S.input} required />
          <label style={S.label}>Confirm password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={S.input} required />
          <button type="button" disabled={loading} style={{ ...S.btn, ...S.btnPrimary }}>{loading ? "Resetting..." : "Reset Password"}</button>
        </div>
        <button onClick={() => auth.setAuthScreen("login")} style={{ ...S.link, display: "block", textAlign: "center", marginTop: 12 }}>← Back to login</button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██  SETUP ORGANISATION (first-time after register)
// ═══════════════════════════════════════════════════════════════════════════════
function SetupOrgScreen() {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [abn, setAbn] = useState("");
  const [serviceType, setServiceType] = useState("long_day_care");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Organisation name required"); return; }
    setError(""); setLoading(true);
    try {
      const data = await api("/auth/create-tenant", { method: "POST", body: { name, abn, serviceType } });
      localStorage.setItem("c360_token", data.accessToken);
      localStorage.setItem("c360_tenant", data.tenant.id);
      auth.loadTenants();
      window.location.reload(); // Clean reload with new tenant context
    } catch (err) {
      setError(err.error || "Failed to create organisation");
    }
    setLoading(false);
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>🏫</div>
        <h2 style={S.title}>Set up your centre</h2>
        <p style={S.subtitle}>Create your childcare organisation to get started</p>
        {error && <div style={S.error}>{error}</div>}
        <div>
          <label style={S.label}>Centre / Service name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Sunshine Early Learning Centre" style={S.input} required autoFocus />
          <label style={S.label}>ABN (optional)</label>
          <input value={abn} onChange={e => setAbn(e.target.value)} placeholder="12 345 678 901" style={S.input} />
          <label style={S.label}>Service type</label>
          <select value={serviceType} onChange={e => setServiceType(e.target.value)} style={S.input}>
            <option value="long_day_care">Long Day Care</option>
            <option value="family_day_care">Family Day Care</option>
            <option value="preschool">Preschool / Kindergarten</option>
            <option value="oshc">OSHC (Outside School Hours Care)</option>
          </select>
          <button type="button" disabled={loading} style={{ ...S.btn, ...S.btnPrimary, marginTop: 12 }}>
            {loading ? "Creating..." : "Create Organisation"}
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={auth.logout} style={S.link}>Sign out</button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██  TENANT PICKER (multi-org users)
// ═══════════════════════════════════════════════════════════════════════════════
function TenantPickerScreen() {
  const auth = useAuth();

  const handleSelect = async (tenantId) => {
    await auth.switchTenant(tenantId);
    window.location.reload();
  };

  const serviceLabels = { long_day_care: "Long Day Care", family_day_care: "Family Day Care", preschool: "Preschool", oshc: "OSHC" };
  const roleColors = { admin: "#8B6DAF", director: "#9B7DC0", educator: "#6BA38B", assistant: "#D4A26A" };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h2 style={S.title}>Select organisation</h2>
        <p style={S.subtitle}>You belong to multiple centres. Choose one to continue.</p>

        {auth.tenants.map(t => (
          <div key={t.id} onClick={() => handleSelect(t.id)} style={S.tenantCard}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#8B6DAF"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#D9D0C7"}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#3D3248", marginBottom: 4 }}>{t.name}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#8A7F96" }}>{serviceLabels[t.service_type] || t.service_type}</span>
              <span style={{ fontSize: 11, color: roleColors[t.role] || "#8A7F96", fontWeight: 600, textTransform: "uppercase" }}>{t.role}</span>
            </div>
          </div>
        ))}

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={() => auth.setAuthScreen("setup-org")} style={S.link}>+ Create new organisation</button>
          <span style={{ margin: "0 12px", color: "#D9D0C7" }}>|</span>
          <button onClick={auth.logout} style={S.link}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS: MFA Setup Panel (used inside app settings) ────────────────────
export function MfaSettingsPanel() {
  const auth = useAuth();
  const [step, setStep] = useState("choose"); // choose, setup-totp, confirm-totp, done
  const [qrData, setQrData] = useState(null);
  const [code, setCodeVal] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const setupTotp = async () => {
    try {
      const data = await api("/auth/mfa/setup", { method: "POST", body: { userId: auth.user.id, method: "totp" } });
      setQrData(data);
      setStep("setup-totp");
    } catch (err) {
      setError(err.error || "Setup failed");
    }
  };

  const setupEmail = async () => {
    try {
      await api("/auth/mfa/setup", { method: "POST", body: { userId: auth.user.id, method: "email" } });
      await api("/auth/mfa/confirm", { method: "POST", body: { userId: auth.user.id, code: "000000" } }); // Email MFA auto-confirms
      setSuccess("Email MFA enabled");
      setStep("done");
    } catch (err) {
      setError(err.error || "Setup failed");
    }
  };

  const confirmTotp = async () => {
    try {
      await api("/auth/mfa/confirm", { method: "POST", body: { userId: auth.user.id, code } });
      setSuccess("Authenticator MFA enabled!");
      setStep("done");
    } catch (err) {
      setError(err.error || "Invalid code");
    }
  };

  if (step === "done") {
    return (
      <div style={{ background: "#F8F5F1", borderRadius: 10, padding: 16 }}>
        <div style={{ color: "#6BA38B", fontWeight: 600, marginBottom: 4 }}>✅ Two-factor authentication is enabled</div>
        <div style={{ fontSize: 13, color: "#8A7F96" }}>{success}</div>
      </div>
    );
  }

  if (step === "setup-totp" && qrData) {
    return (
      <div style={{ background: "#F8F5F1", borderRadius: 10, padding: 16 }}>
        <h4 style={{ color: "#3D3248", margin: "0 0 8px" }}>Set up authenticator app</h4>
        <p style={{ fontSize: 12, color: "#8A7F96", margin: "0 0 12px" }}>
          Scan this QR code with Google Authenticator, Authy, or similar app.
          Or manually enter the secret: <code style={{ color: "#A88BC7" }}>{qrData.secret}</code>
        </p>
        <div style={{ background: "#fff", borderRadius: 8, padding: 16, width: 200, height: 200, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 12, color: "#333", textAlign: "center" }}>
            📱 QR Code<br/><span style={{ fontSize: 10 }}>Use otpauth URL in your app</span>
            <br/><code style={{ fontSize: 8, wordBreak: "break-all" }}>{qrData.otpauthUrl}</code>
          </div>
        </div>
        {error && <div style={{ ...S.error, marginBottom: 8 }}>{error}</div>}
        <input value={code} onChange={e => setCodeVal(e.target.value)} placeholder="Enter 6-digit code from app"
          style={{ ...S.input, marginBottom: 8 }} />
        <button onClick={confirmTotp} style={{ ...S.btn, ...S.btnPrimary, width: "auto", padding: "8px 20px" }}>Verify & Enable</button>
      </div>
    );
  }

  return (
    <div style={{ background: "#F8F5F1", borderRadius: 10, padding: 16 }}>
      <h4 style={{ color: "#3D3248", margin: "0 0 8px" }}>🔐 Two-Factor Authentication</h4>
      <p style={{ fontSize: 12, color: "#8A7F96", margin: "0 0 12px" }}>
        Add an extra layer of security to protect sensitive children's data.
      </p>
      {error && <div style={{ ...S.error, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={setupTotp} style={{ ...S.btn, ...S.btnPrimary, width: "auto", padding: "10px 20px" }}>
          🔐 Authenticator App
        </button>
        <button onClick={setupEmail} style={{ ...S.btn, background: "#E8E0D8", color: "#5C4E6A", width: "auto", padding: "10px 20px" }}>
          📧 Email Codes
        </button>
      </div>
    </div>
  );
}

// ── Auth Screen Router ──────────────────────────────────────────────────────
function AuthScreenRouter() {
  const auth = useAuth();
  const screen = auth.authScreen;
  if (screen === "register")          return <RegisterScreen />;
  if (screen === "verify-email")      return <VerifyEmailScreen />;
  if (screen === "mfa")               return <MfaScreen />;
  if (screen === "forgot-password")   return <ForgotPasswordScreen />;
  if (screen === "reset-password")    return <ResetPasswordScreen />;
  if (screen === "setup-org")         return <SetupOrgScreen />;
  if (screen === "pick-tenant")       return <TenantPickerScreen />;
  return <LoginScreen />;
}

// ── User menu (for sidebar) ─────────────────────────────────────────────────
export function UserMenu({ onSettings }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);

  if (!auth.user) return null;

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "10px 14px", borderRadius: 8 }}
        onMouseEnter={e => e.currentTarget.style.background = "#E8E0D8"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: auth.user.avatar_url ? `url(${auth.user.avatar_url}) center/cover` : "linear-gradient(135deg, #8B6DAF, #B5A0CC)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff",
        }}>
          {!auth.user.avatar_url && auth.user.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#3D3248" }}>{auth.user.name}</div>
          <div style={{ fontSize: 10, color: "#A89DB5" }}>{auth.currentTenant?.name || "No org"}</div>
        </div>
        <span style={{ color: "#A89DB5", fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", bottom: "100%", left: 0, right: 0, background: "#FFFFFF",
          border: "1px solid #D9D0C7", borderRadius: 10, padding: 6, marginBottom: 4,
          boxShadow: "0 8px 30px rgba(80,60,90,0.06)", zIndex: 100,
        }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #E8E0D8", marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: "#8A7F96" }}>{auth.user.email}</div>
            <div style={{ fontSize: 11, color: "#8B6DAF", fontWeight: 600, textTransform: "uppercase" }}>{auth.currentTenant?.role || "—"}</div>
          </div>
          {auth.tenants.length > 1 && (
            <button onClick={() => { setOpen(false); auth.setAuthScreen("pick-tenant"); }}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: "#5C4E6A", padding: "8px 12px", cursor: "pointer", fontSize: 12, borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.background = "#E8E0D8"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              🔄 Switch Organisation
            </button>
          )}
          {onSettings && (
            <button onClick={() => { setOpen(false); onSettings(); }}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: "#5C4E6A", padding: "8px 12px", cursor: "pointer", fontSize: 12, borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.background = "#E8E0D8"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              ⚙️ Settings
            </button>
          )}
          <button onClick={() => { setOpen(false); auth.logout(); }}
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: "#C9828A", padding: "8px 12px", cursor: "pointer", fontSize: 12, borderRadius: 6 }}
            onMouseEnter={e => e.currentTarget.style.background = "#E8E0D8"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            🚪 Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
