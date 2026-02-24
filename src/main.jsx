import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider, AuthGate } from './AuthModule.jsx'
import ChildcareRosterApp from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <ChildcareRosterApp />
      </AuthGate>
    </AuthProvider>
  </React.StrictMode>
)
