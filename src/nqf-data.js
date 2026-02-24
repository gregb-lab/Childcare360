// ─── NQF DATA: EYLF V2.0, MTOP V2.0, NQS, Developmental Domains ──────────────
// Belonging, Being & Becoming: The Early Years Learning Framework V2.0 2022
// My Time, Our Place: Framework for School Age Care V2.0 2022
// National Quality Standard (7 Quality Areas)
// ────────────────────────────────────────────────────────────────────────────────

export const EYLF_OUTCOMES = [
  {
    id: "LO1", code: "1", title: "Children have a strong sense of identity",
    color: "#C9929E", icon: "👤", framework: "EYLF",
    subOutcomes: [
      { id: "1.1", text: "Children feel safe, secure and supported",
        indicators: ["Seeks trusted adults for comfort","Separates from carer with growing confidence","Openly expresses feelings","Responds to cultural traditions in their community","Demonstrates trust in adults at service"] },
      { id: "1.2", text: "Children develop their emerging autonomy, inter-dependence, resilience and sense of agency",
        indicators: ["Makes choices about activities","Shows growing independence in self-care","Persists when faced with challenges","Demonstrates increasing self-regulation","Asserts self constructively"] },
      { id: "1.3", text: "Children develop knowledgeable, confident self-identities and a positive sense of self",
        indicators: ["Explores different identities through play","Shows pride in achievements","Shares aspects of cultural identity","Demonstrates confidence in familiar settings","Describes self positively"] },
      { id: "1.4", text: "Children learn to interact in relation to others with care, empathy and respect",
        indicators: ["Shows empathy for others' feelings","Takes turns and shares resources","Cooperates in group activities","Uses respectful language","Begins to negotiate and resolve conflicts"] },
    ]
  },
  {
    id: "LO2", code: "2", title: "Children are connected with and contribute to their world",
    color: "#9B7DC0", icon: "🌏", framework: "EYLF",
    subOutcomes: [
      { id: "2.1", text: "Children develop a sense of belonging to groups and communities and an understanding of the reciprocal rights and responsibilities necessary for active community participation",
        indicators: ["Cooperates with others in group tasks","Shows understanding of group rules","Participates in community and cultural events","Takes on responsibilities within the group","Demonstrates awareness of connections to place"] },
      { id: "2.2", text: "Children respond to diversity with respect",
        indicators: ["Listens to others' perspectives","Shows interest in diverse cultures and heritage","Begins to recognise fairness","Includes others in play","Explores cultural traditions beyond own experience"] },
      { id: "2.3", text: "Children become aware of fairness",
        indicators: ["Notices unfair situations","Begins to advocate for self and others","Discusses what is fair or unfair","Shows developing sense of justice","Responds to being treated unfairly"] },
      { id: "2.4", text: "Children become socially responsible and show respect for the environment",
        indicators: ["Cares for natural environments","Participates in sustainable practices","Shows concern for living things","Explores the natural world with wonder","Demonstrates awareness of human impact on environment"] },
    ]
  },
  {
    id: "LO3", code: "3", title: "Children have a strong sense of wellbeing",
    color: "#6BA38B", icon: "💚", framework: "EYLF",
    subOutcomes: [
      { id: "3.1", text: "Children become strong in their social, emotional and spiritual wellbeing",
        indicators: ["Expresses a range of emotions appropriately","Develops secure attachments","Shows growing emotional regulation","Seeks comfort when distressed","Demonstrates optimism and cheerfulness"] },
      { id: "3.2", text: "Children take increasing responsibility for their own health and physical wellbeing",
        indicators: ["Engages in active physical play","Makes healthy food choices","Practices hygiene routines independently","Recognises and communicates bodily needs","Demonstrates increasing coordination and control"] },
      { id: "3.3", text: "Children are aware of and develop strategies to support their own mental and physical health and personal safety",
        indicators: ["Identifies risky situations","Communicates when feeling unsafe","Seeks help from trusted adults","Shows awareness of safe/unsafe situations","Develops strategies to manage wellbeing"] },
    ]
  },
  {
    id: "LO4", code: "4", title: "Children are confident and involved learners",
    color: "#D4A26A", icon: "🧠", framework: "EYLF",
    subOutcomes: [
      { id: "4.1", text: "Children develop dispositions for learning such as curiosity, cooperation, confidence, creativity, commitment, enthusiasm, persistence, imagination and reflexivity",
        indicators: ["Shows curiosity and enthusiasm for learning","Persists with challenging tasks","Takes considered risks in learning","Approaches new experiences with confidence","Shows imagination in play"] },
      { id: "4.2", text: "Children develop a range of skills and processes such as problem-solving, inquiry, experimentation, hypothesising, researching and investigating",
        indicators: ["Asks questions to extend understanding","Tests ideas through trial and error","Makes predictions and checks results","Uses tools and technology for investigation","Applies mathematical thinking in play"] },
      { id: "4.3", text: "Children transfer and adapt what they have learned from one context to another",
        indicators: ["Applies learned skills in new situations","Makes connections between experiences","Uses prior knowledge to solve problems","Adapts strategies for different contexts","Transfers language and concepts across settings"] },
      { id: "4.4", text: "Children resource their own learning through connecting with people, place, technologies and natural and processed materials",
        indicators: ["Seeks information from multiple sources","Uses natural materials creatively","Engages with technology as a learning tool","Collaborates with peers for learning","Chooses and uses resources purposefully"] },
    ]
  },
  {
    id: "LO5", code: "5", title: "Children are effective communicators",
    color: "#B5A0CC", icon: "💬", framework: "EYLF",
    subOutcomes: [
      { id: "5.1", text: "Children interact verbally and non-verbally with others for a range of purposes",
        indicators: ["Uses language to express ideas and needs","Engages in conversations with adults and peers","Uses gestures and body language to communicate","Listens and responds to others","Adjusts communication for different audiences"] },
      { id: "5.2", text: "Children engage with a range of texts and gain meaning from these texts",
        indicators: ["Shows interest in books and stories","Retells familiar stories and events","Recognises familiar signs, symbols and logos","Explores texts from diverse cultures","Engages with digital texts appropriately"] },
      { id: "5.3", text: "Children express ideas and make meaning using a range of media",
        indicators: ["Uses drawing and painting to express ideas","Engages in dramatic/imaginative play","Creates with various materials and media","Experiments with music, movement and dance","Represents ideas through construction"] },
      { id: "5.4", text: "Children begin to understand how symbols and pattern systems work",
        indicators: ["Recognises letters in own name","Shows interest in numbers and counting","Uses symbols in play and drawing","Explores patterns in the environment","Experiments with writing-like behaviours and mark-making"] },
      { id: "5.5", text: "Children use digital technologies and media to investigate ideas and represent their thinking",
        indicators: ["Uses age-appropriate technology with purpose","Creates content using digital tools","Uses technology as a tool for learning","Shares ideas using digital media","Begins to understand digital citizenship"] },
    ]
  },
];

// ── MTOP V2.0 (My Time, Our Place — School Age Care / OSHC) ────────────────────
export const MTOP_OUTCOMES = [
  { id: "MO1", code: "1", title: "Children have a strong sense of identity", color: "#C9929E", icon: "👤", framework: "MTOP",
    subOutcomes: [
      { id: "M1.1", text: "Children feel safe, secure, supported and known" },
      { id: "M1.2", text: "Children develop their autonomy, inter-dependence, resilience and sense of agency" },
      { id: "M1.3", text: "Children develop knowledgeable, confident self-identities" },
      { id: "M1.4", text: "Children learn to interact in relation to others with care, empathy and respect" },
    ]
  },
  { id: "MO2", code: "2", title: "Children are connected with and contribute to their world", color: "#9B7DC0", icon: "🌏", framework: "MTOP",
    subOutcomes: [
      { id: "M2.1", text: "Children develop a sense of belonging to groups and communities" },
      { id: "M2.2", text: "Children respond to diversity with respect" },
      { id: "M2.3", text: "Children become aware of fairness" },
      { id: "M2.4", text: "Children become socially responsible and show respect for the environment" },
    ]
  },
  { id: "MO3", code: "3", title: "Children have a strong sense of wellbeing", color: "#6BA38B", icon: "💚", framework: "MTOP",
    subOutcomes: [
      { id: "M3.1", text: "Children become strong in their social, emotional and spiritual wellbeing" },
      { id: "M3.2", text: "Children take increasing responsibility for their own health and physical wellbeing" },
      { id: "M3.3", text: "Children are aware of and develop strategies to support their own health, safety and wellbeing" },
    ]
  },
  { id: "MO4", code: "4", title: "Children are confident and involved learners", color: "#D4A26A", icon: "🧠", framework: "MTOP",
    subOutcomes: [
      { id: "M4.1", text: "Children develop dispositions for learning" },
      { id: "M4.2", text: "Children develop a range of learning and thinking skills and processes" },
      { id: "M4.3", text: "Children transfer and adapt what they have learned from one context to another" },
      { id: "M4.4", text: "Children resource their own learning" },
    ]
  },
  { id: "MO5", code: "5", title: "Children are effective communicators", color: "#B5A0CC", icon: "💬", framework: "MTOP",
    subOutcomes: [
      { id: "M5.1", text: "Children interact verbally and non-verbally with others for a range of purposes" },
      { id: "M5.2", text: "Children engage with a range of texts and gain meaning from these texts" },
      { id: "M5.3", text: "Children express ideas and make meaning using a range of media" },
      { id: "M5.4", text: "Children begin to understand how symbols and pattern systems work" },
      { id: "M5.5", text: "Children use digital technologies and media to investigate ideas and represent their thinking" },
    ]
  },
];

// ── DEVELOPMENTAL DOMAINS (mapped to EYLF/MTOP) ────────────────────────────────
export const DEV_DOMAINS = [
  { id: "language", label: "Language & Literacy", icon: "📖", color: "#B5A0CC",
    eylfLinks: ["5.1","5.2","5.4"], description: "Verbal/non-verbal communication, pre-reading, vocabulary, storytelling",
    activities: ["Story time with open questions","Puppet show conversations","Sound and rhyme games","Name recognition activities","Shared book reading with prediction","Song and fingerplay sessions"] },
  { id: "motor_fine", label: "Fine Motor Skills", icon: "✂️", color: "#C9929E",
    eylfLinks: ["3.2","4.1","5.3"], description: "Drawing, cutting, threading, writing-like marks, hand-eye coordination",
    activities: ["Playdough manipulation","Threading beads","Cutting and collage","Drawing and mark-making","Pegboard activities","Tong and tweezers transfer games"] },
  { id: "motor_gross", label: "Gross Motor Skills", icon: "🏃", color: "#6BA38B",
    eylfLinks: ["3.2","3.3"], description: "Running, jumping, climbing, balance, spatial awareness, body control",
    activities: ["Obstacle courses","Ball games (throwing, catching, kicking)","Dance and movement to music","Balance beam activities","Climbing and swinging","Yoga and stretching"] },
  { id: "social", label: "Social & Emotional", icon: "🤝", color: "#9B7DC0",
    eylfLinks: ["1.1","1.2","1.4","2.1"], description: "Sharing, turn-taking, empathy, self-regulation, conflict resolution",
    activities: ["Cooperative group games","Emotion identification with picture cards","Role-play scenarios","Turn-taking board games","Feelings journal/drawing","Small group collaborative projects"] },
  { id: "cognitive", label: "Cognitive & Problem-Solving", icon: "🧩", color: "#D4A26A",
    eylfLinks: ["4.1","4.2","4.3"], description: "Counting, sorting, patterns, cause-effect, inquiry, experimentation",
    activities: ["Sorting and classifying by attribute","Simple science experiments","Puzzle completion","Pattern making with objects","Counting during routines","Cause and effect exploration (ramps, water flow)"] },
  { id: "creative", label: "Creative Expression", icon: "🎨", color: "#D49060",
    eylfLinks: ["4.1","5.3"], description: "Art, music, dance, dramatic play, imagination, self-expression",
    activities: ["Free painting and drawing","Music and rhythm exploration","Dramatic play / dress-up","Construction with loose parts","Sensory art (finger painting, clay)","Collaborative mural or group art"] },
  { id: "identity", label: "Identity & Belonging", icon: "⭐", color: "#B87D8E",
    eylfLinks: ["1.1","1.3","2.2"], description: "Self-confidence, cultural awareness, independence, sense of belonging",
    activities: ["'All About Me' activities","Family photo sharing","Cultural cooking experiences","Self-portrait projects","Celebration of diverse holidays","'Helper of the day' responsibilities"] },
  { id: "wellbeing", label: "Health & Wellbeing", icon: "💪", color: "#6BA38B",
    eylfLinks: ["3.1","3.2","3.3"], description: "Hygiene, nutrition awareness, rest needs, physical safety, self-care",
    activities: ["Handwashing songs and routines","Healthy food tasting","Relaxation / mindfulness","Body awareness activities","Safe/unsafe discussion with pictures","Self-dressing practice"] },
];

export const SKILL_LEVELS = [
  { id: 1, label: "Emerging", color: "#C9828A", bgColor: "#FDF3F3", description: "Beginning to show awareness, needs significant support" },
  { id: 2, label: "Developing", color: "#D4A26A", bgColor: "#FFF8F0", description: "Growing capability with regular support and scaffolding" },
  { id: 3, label: "Consolidating", color: "#9B7DC0", bgColor: "#F3EFF8", description: "Showing consistent ability with occasional support" },
  { id: 4, label: "Proficient", color: "#6BA38B", bgColor: "#F0F7F2", description: "Demonstrates skill independently and confidently" },
  { id: 5, label: "Extending", color: "#8B6DAF", bgColor: "#F3EFF8", description: "Exceeding expectations, teaching/helping peers" },
];

export const OBSERVATION_TYPES = [
  { id: "learning_story", label: "Learning Story", icon: "📝", description: "Narrative description of significant learning moment" },
  { id: "jotting", label: "Jotting", icon: "✏️", description: "Quick note capturing a moment or behaviour" },
  { id: "photo", label: "Photo Documentation", icon: "📷", description: "Photo with annotation about what learning is visible" },
  { id: "work_sample", label: "Work Sample", icon: "🖼️", description: "Child's artwork, writing, or creation with context" },
  { id: "checklist", label: "Checklist / Milestone", icon: "☑️", description: "Skills or milestones observed being demonstrated" },
];

// ── NQS QUALITY AREAS (for compliance mapping) ─────────────────────────────────
export const NQS_AREAS = [
  { id: "QA1", title: "Educational program and practice", color: "#8B6DAF",
    standards: [
      { id: "1.1", title: "Program", desc: "The educational program enhances each child's learning and development",
        elements: ["1.1.1 Approved learning framework","1.1.2 Child-centred","1.1.3 Program learning opportunities"] },
      { id: "1.2", title: "Practice", desc: "Educators facilitate and extend each child's learning and development",
        elements: ["1.2.1 Intentional teaching","1.2.2 Responsive teaching and scaffolding","1.2.3 Child directed learning"] },
      { id: "1.3", title: "Assessment and planning", desc: "Educators and co-ordinators take a planned and reflective approach",
        elements: ["1.3.1 Assessment and planning cycle","1.3.2 Critical reflection","1.3.3 Information for families"] },
    ]},
  { id: "QA2", title: "Children's health and safety", color: "#C06B73" },
  { id: "QA3", title: "Physical environment", color: "#C98F55" },
  { id: "QA4", title: "Staffing arrangements", color: "#5E9A7D" },
  { id: "QA5", title: "Relationships with children", color: "#7B9DC8" },
  { id: "QA6", title: "Collaborative partnerships with families and communities", color: "#9B7DC0" },
  { id: "QA7", title: "Governance and leadership", color: "#B87D8E" },
];

// ── SAMPLE CHILDREN (Possums room — Toddlers) ──────────────────────────────────
export const INITIAL_CHILDREN = [
  { id: 101, firstName: "Liam", lastName: "Murphy", dob: "2022-03-15", roomId: 2, photo: null, allergies: "None", emergencyContact: "Kate Murphy – 0412 111 222", enrolledDate: "2023-06-01",
    domains: { language: 2, motor_fine: 2, motor_gross: 3, social: 2, cognitive: 3, creative: 3, identity: 3, wellbeing: 3 },
    eylfProgress: { "1.1":3,"1.2":2,"1.4":2,"3.2":3,"4.1":3,"5.1":2,"5.4":1 },
    notes: "Responds well to visual prompts. Enjoys outdoor play. Sometimes hesitant in group conversations.",
    learningGoals: ["Build confidence in verbal expression","Develop pencil grip strength","Encourage peer interactions during play"] },
  { id: 102, firstName: "Ava", lastName: "Chen", dob: "2022-07-22", roomId: 2, photo: null, allergies: "Egg", emergencyContact: "Wei Chen – 0423 222 333", enrolledDate: "2023-08-15",
    domains: { language: 3, motor_fine: 3, motor_gross: 2, social: 3, cognitive: 4, creative: 4, identity: 3, wellbeing: 3 },
    eylfProgress: { "1.1":4,"1.2":3,"1.4":3,"3.1":3,"4.1":4,"4.2":4,"5.1":3,"5.3":4 },
    notes: "Very creative and expressive. Strong problem-solving skills. Needs encouragement with physical challenges.",
    learningGoals: ["Build confidence in gross motor activities","Extend creative expression through mixed media"] },
  { id: 103, firstName: "Noah", lastName: "Williams", dob: "2022-01-10", roomId: 2, photo: null, allergies: "None", emergencyContact: "Sarah Williams – 0434 333 444", enrolledDate: "2023-03-20",
    domains: { language: 1, motor_fine: 2, motor_gross: 4, social: 2, cognitive: 2, creative: 2, identity: 2, wellbeing: 4 },
    eylfProgress: { "1.1":3,"1.2":2,"1.4":2,"3.2":4,"4.1":2,"5.1":1,"5.4":1 },
    notes: "Very active physically. Language development is focus — bilingual household (English/Mandarin). Benefits from one-on-one reading time.",
    learningGoals: ["Intensive language support activities","Introduce structured storytelling","Support fine motor through playdough and threading"] },
  { id: 104, firstName: "Mia", lastName: "Patel", dob: "2022-05-30", roomId: 2, photo: null, allergies: "Dairy", emergencyContact: "Anita Patel – 0445 444 555", enrolledDate: "2023-07-10",
    domains: { language: 2, motor_fine: 3, motor_gross: 3, social: 1, cognitive: 3, creative: 3, identity: 2, wellbeing: 3 },
    eylfProgress: { "1.1":2,"1.2":2,"1.4":1,"2.1":1,"3.1":2,"4.1":3,"5.1":2 },
    notes: "Quiet in groups but very focused individually. Separation anxiety improving. Responds well to predictable routines.",
    learningGoals: ["Gradual social integration in small groups","Build emotional vocabulary","Strengthen sense of belonging"] },
  { id: 105, firstName: "Oliver", lastName: "Kim", dob: "2022-09-18", roomId: 2, photo: null, allergies: "None", emergencyContact: "Ji-Yeon Kim – 0456 555 666", enrolledDate: "2024-01-15",
    domains: { language: 2, motor_fine: 1, motor_gross: 2, social: 3, cognitive: 2, creative: 2, identity: 3, wellbeing: 2 },
    eylfProgress: { "1.1":3,"1.4":3,"3.2":2,"4.1":2,"5.1":2,"5.4":1 },
    notes: "Sociable and friendly. Fine motor skills need significant development. Enjoys sensory play.",
    learningGoals: ["Fine motor development through sensory activities","Introduce mark-making and pre-writing","Build physical confidence"] },
  { id: 106, firstName: "Charlotte", lastName: "Brown", dob: "2022-11-05", roomId: 2, photo: null, allergies: "Nuts", emergencyContact: "Emma Brown – 0467 666 777", enrolledDate: "2024-02-01",
    domains: { language: 3, motor_fine: 3, motor_gross: 3, social: 4, cognitive: 3, creative: 4, identity: 4, wellbeing: 3 },
    eylfProgress: { "1.1":4,"1.2":4,"1.3":4,"1.4":4,"2.1":3,"3.1":3,"4.1":3,"5.1":3,"5.3":4 },
    notes: "Strong leader in group play. Excellent verbal skills for age. Loves role-play and dress-up. Can help scaffold peers.",
    learningGoals: ["Extend leadership skills","Introduce early literacy concepts","Challenge with complex problem-solving"] },
  { id: 107, firstName: "Jack", lastName: "Taylor", dob: "2022-06-14", roomId: 2, photo: null, allergies: "None", emergencyContact: "Mark Taylor – 0478 777 888", enrolledDate: "2023-09-01",
    domains: { language: 2, motor_fine: 2, motor_gross: 3, social: 2, cognitive: 2, creative: 2, identity: 2, wellbeing: 3 },
    eylfProgress: { "1.1":2,"1.2":2,"3.2":3,"4.1":2,"5.1":2 },
    notes: "Enjoys construction play and vehicles. Takes time to warm up. Responds well to male educators.",
    learningGoals: ["Language development through construction narratives","Build social confidence through shared interests","Fine motor through building"] },
  { id: 108, firstName: "Sophia", lastName: "Nguyen", dob: "2022-04-25", roomId: 2, photo: null, allergies: "None", emergencyContact: "Linh Nguyen – 0489 888 999", enrolledDate: "2023-05-15",
    domains: { language: 1, motor_fine: 2, motor_gross: 3, social: 2, cognitive: 3, creative: 3, identity: 2, wellbeing: 3 },
    eylfProgress: { "1.1":3,"1.2":2,"3.2":3,"4.1":3,"4.2":3,"5.1":1,"5.2":2 },
    notes: "Bilingual (English/Vietnamese). Strong in hands-on investigation. English is emerging — uses home language confidently.",
    learningGoals: ["English language immersion through play","Maintain home language connection","Extend investigative play skills"] },
  { id: 109, firstName: "Ethan", lastName: "Jones", dob: "2022-08-30", roomId: 2, photo: null, allergies: "Gluten", emergencyContact: "Rebecca Jones – 0490 999 000", enrolledDate: "2024-01-10",
    domains: { language: 2, motor_fine: 2, motor_gross: 2, social: 2, cognitive: 2, creative: 2, identity: 2, wellbeing: 2 },
    eylfProgress: { "1.1":2,"1.2":2,"3.2":2,"4.1":2,"5.1":2 },
    notes: "Recently joined. Still settling in. Generally developing across all areas. Enjoys water play and sand play.",
    learningGoals: ["Support settling and sense of belonging","Broad developmental exploration","Build confidence in all domains"] },
  { id: 110, firstName: "Isla", lastName: "O'Brien", dob: "2022-02-20", roomId: 2, photo: null, allergies: "None", emergencyContact: "Fiona O'Brien – 0491 000 111", enrolledDate: "2023-04-01",
    domains: { language: 2, motor_fine: 3, motor_gross: 3, social: 3, cognitive: 3, creative: 4, identity: 3, wellbeing: 3 },
    eylfProgress: { "1.1":3,"1.4":3,"2.2":3,"3.1":3,"4.1":3,"5.1":2,"5.3":4 },
    notes: "Wonderful imagination. Loves painting and creating stories through art. Language could be extended further.",
    learningGoals: ["Extend verbal storytelling from art","Build vocabulary through descriptive play","Introduce early writing through art narratives"] },
  { id: 111, firstName: "Leo", lastName: "Garcia", dob: "2022-10-12", roomId: 2, photo: null, allergies: "None", emergencyContact: "Maria Garcia – 0492 111 222", enrolledDate: "2024-03-01",
    domains: { language: 1, motor_fine: 1, motor_gross: 2, social: 2, cognitive: 2, creative: 2, identity: 2, wellbeing: 2 },
    eylfProgress: { "1.1":2,"1.2":1,"3.2":2,"4.1":2,"5.1":1,"5.4":1 },
    notes: "Bilingual (English/Spanish). Youngest in room. Language and fine motor are primary focus areas. Very energetic and curious.",
    learningGoals: ["Intensive language exposure","Fine motor foundational skills","Build confidence and independence"] },
  { id: 112, firstName: "Amelia", lastName: "Singh", dob: "2022-04-08", roomId: 2, photo: null, allergies: "None", emergencyContact: "Raj Singh – 0493 222 333", enrolledDate: "2023-06-15",
    domains: { language: 3, motor_fine: 3, motor_gross: 2, social: 3, cognitive: 3, creative: 3, identity: 3, wellbeing: 3 },
    eylfProgress: { "1.1":3,"1.4":3,"2.1":3,"3.1":3,"4.1":3,"4.2":3,"5.1":3,"5.2":3 },
    notes: "Well-rounded development. Strong communicator. Could be challenged with more complex problem-solving and physical activities.",
    learningGoals: ["Extend critical thinking through open-ended problems","Build gross motor confidence","Introduce early numeracy concepts"] },
  // ── Joeys room children (babies) ──
  { id: 201, firstName: "Ruby", lastName: "White", dob: "2024-01-15", roomId: 1, photo: null, allergies: "None", emergencyContact: "Lisa White – 0412 333 444", enrolledDate: "2024-06-01",
    domains: { language: 1, motor_fine: 1, motor_gross: 1, social: 1, cognitive: 1, creative: 1, identity: 1, wellbeing: 2 },
    eylfProgress: { "1.1":2,"3.1":2,"3.2":2,"5.1":1 },
    notes: "9 months. Babbling, reaching for objects. Responsive to faces and voices.",
    learningGoals: ["Sensory exploration","Tummy time and movement","Responsive interactions and attachment"] },
  { id: 202, firstName: "Henry", lastName: "Davis", dob: "2023-11-20", roomId: 1, photo: null, allergies: "None", emergencyContact: "John Davis – 0423 444 555", enrolledDate: "2024-04-01",
    domains: { language: 1, motor_fine: 1, motor_gross: 2, social: 1, cognitive: 1, creative: 1, identity: 1, wellbeing: 2 },
    eylfProgress: { "1.1":2,"3.1":2,"3.2":2,"5.1":1 },
    notes: "12 months. Starting to pull to stand. Enjoys peek-a-boo and cause-effect toys.",
    learningGoals: ["Support first steps","Object permanence play","Social referencing development"] },
  // ── Koalas room children (preschool) ──
  { id: 301, firstName: "Zoe", lastName: "Martin", dob: "2021-05-10", roomId: 3, photo: null, allergies: "None", emergencyContact: "Helen Martin – 0434 555 666", enrolledDate: "2023-01-15",
    domains: { language: 4, motor_fine: 4, motor_gross: 3, social: 4, cognitive: 4, creative: 4, identity: 4, wellbeing: 4 },
    eylfProgress: { "1.1":4,"1.2":4,"1.3":4,"1.4":4,"2.1":4,"3.1":4,"3.2":3,"4.1":4,"4.2":4,"5.1":4,"5.2":4,"5.3":4,"5.4":3 },
    notes: "School-ready. Strong across all domains. Natural leader. Writing own name and beginning sight words.",
    learningGoals: ["School transition preparation","Extend literacy — beginning reading","Peer mentoring opportunities"] },
  { id: 302, firstName: "Max", lastName: "Lee", dob: "2021-08-22", roomId: 3, photo: null, allergies: "Peanuts", emergencyContact: "Jenny Lee – 0445 666 777", enrolledDate: "2023-03-01",
    domains: { language: 3, motor_fine: 3, motor_gross: 4, social: 3, cognitive: 4, creative: 3, identity: 3, wellbeing: 4 },
    eylfProgress: { "1.1":3,"1.2":3,"1.4":3,"3.2":4,"4.1":4,"4.2":4,"4.3":3,"5.1":3,"5.4":3 },
    notes: "Strong in STEM — loves building, measuring, experiments. Enjoys outdoor physical challenges.",
    learningGoals: ["Extend STEM inquiry projects","Support social-emotional expression","Introduce journaling"] },
];

// ── WIZARD REFLECTION PROMPTS (Socratic approach) ──────────────────────────────
export const REFLECTION_PROMPTS = {
  classroom_analysis: [
    "Looking at your classroom profile data, what patterns stand out to you?",
    "Which developmental areas seem to have the most children needing support?",
    "Are there any children whose needs are quite different from the group?",
    "What strengths do you notice across the room that you could build on?",
    "How might the mix of skill levels create opportunities for peer learning?",
  ],
  focus_selection: [
    "Considering the patterns you've identified, which 2-3 areas feel most important today?",
    "How does today's focus connect to what the children experienced yesterday?",
    "Which EYLF outcomes would you most like to see evidence of today?",
    "Are there any individual children who would particularly benefit from today's focus?",
    "What balance between group needs and individual goals feels right?",
  ],
  activity_planning: [
    "What kind of play experience might naturally support this learning area?",
    "How could you set up the environment to invite this type of exploration?",
    "What open-ended questions could you ask to extend children's thinking?",
    "How will you know if children are engaged and learning during this activity?",
    "How can you make this activity accessible for children at different levels?",
    "What materials or provocations might spark children's curiosity here?",
  ],
  reflection: [
    "What surprised you about the children's responses today?",
    "Which children showed unexpected progress or engagement?",
    "What would you change if you repeated this experience?",
    "How did today's activities connect to the EYLF outcomes you intended?",
    "What follow-up experiences might extend today's learning tomorrow?",
  ],
};

// ── ACTIVITY SUGGESTIONS BY DOMAIN + AGE GROUP ──────────────────────────────────
export const ACTIVITY_BANK = {
  language: {
    babies: ["Narrate daily routines","Sing nursery rhymes with actions","Point and name objects","Read board books with textures","Respond to babbling with conversation"],
    toddlers: ["Story time with prediction questions","Puppet show conversations","Picture walks — 'What can you see?'","Sound matching games","Action songs with vocabulary","Descriptive play narration"],
    preschool: ["Shared reading with comprehension questions","Show and tell circle","Retelling stories with props","Letter of the week exploration","Collaborative story writing","Rhyming and alliteration games"],
  },
  motor_fine: {
    babies: ["Grasping soft toys","Finger food exploration","Stacking 2-3 blocks","Tearing paper","Water play — pouring and scooping"],
    toddlers: ["Playdough — rolling, squishing, cutting","Threading large beads","Drawing with chunky crayons","Collage — tearing and gluing","Pegboard activities","Spooning and pouring at sensory table"],
    preschool: ["Scissor skills — cutting shapes","Writing name practice","Detailed drawing and colouring","Lacing cards and weaving","Small construction (Lego, connectors)","Painting with fine brushes"],
  },
  motor_gross: {
    babies: ["Tummy time exploration","Reaching for suspended objects","Supported standing/cruising","Rolling and crawling obstacle courses","Dance to music with movement"],
    toddlers: ["Obstacle course — crawl, climb, jump","Ball games — rolling, throwing","Balance beam walking","Riding trikes/scooters","Dancing and movement games","Climbing frame play"],
    preschool: ["Organised games (relay, tag)","Skipping and hopping challenges","Ball skills — catching, bouncing","Yoga and body awareness","Climbing and swinging","Sports skill introduction"],
  },
  social: {
    babies: ["Peek-a-boo with peers","Parallel play alongside others","Gentle touch interactions","Sharing smiles and responses","Group music time"],
    toddlers: ["Cooperative block building","Turn-taking games","Emotion picture cards discussion","Role-play kitchen/shop","Sharing basket activities","Small group collaborative art"],
    preschool: ["Team projects and challenges","Conflict resolution role-play","Feelings diary / emotions check-in","Cooperative board games","Community helpers exploration","Friendship skills discussion"],
  },
  cognitive: {
    babies: ["Object permanence (peek-a-boo, hidden toys)","Cause-effect toys","Simple shape sorters","Exploring textures and materials","Mirror play"],
    toddlers: ["Sorting by colour, size, shape","Simple puzzles (4-8 pieces)","Counting during routines","Sink or float experiments","Pattern making with blocks","Matching and memory games"],
    preschool: ["Science experiments with predictions","Complex patterns and sequences","Measurement exploration","Problem-solving challenges","Nature investigation and classification","Simple coding/sequencing activities"],
  },
  creative: {
    babies: ["Sensory finger painting","Music shakers and instruments","Texture exploration boards","Dance and movement to music","Safe messy play"],
    toddlers: ["Free painting and drawing","Playdough creation","Dress-up and dramatic play","Music and rhythm instruments","Construction with loose parts","Collage with mixed materials"],
    preschool: ["Mixed media art projects","Sculpture and 3D creation","Theatrical performance/puppet shows","Complex construction challenges","Digital photography projects","Collaborative mural creation"],
  },
  identity: {
    babies: ["Mirror exploration","Photo books of family","Name songs","Cultural music and lullabies","Personal blanket/comfort objects"],
    toddlers: ["'All About Me' activities","Family photo wall","Self-portrait drawings","Cultural food exploration","Helper of the day role","'My favourite things' sharing"],
    preschool: ["'Who Am I' projects","Cultural sharing presentations","Self-assessment and goal setting","Leadership opportunities","Heritage and family tree exploration","Strength-based conversations"],
  },
  wellbeing: {
    babies: ["Responsive settling routines","Gentle massage and touch","Safe exploration of environment","Rest and sleep routines","Nappy change conversations"],
    toddlers: ["Handwashing songs","Healthy food tasting","Relaxation corner time","Body part identification","Self-dressing practice","Feelings check-in circle"],
    preschool: ["Mindfulness and breathing exercises","Nutrition and food groups","Personal safety discussions","Growth and change exploration","Hygiene independence","Emotional regulation strategies"],
  },
};
