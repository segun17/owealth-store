// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBa9ycHT98M1qtYRH7qjSkl7yvBTVeGyG8",
    authDomain: "sbc-project-d9f9d.firebaseapp.com",
    projectId: "sbc-project-d9f9d",
    storageBucket: "sbc-project-d9f9d.appspot.com",
    messagingSenderId: "808078460193",
    appId: "1:808078460193:web:a65c2c9a379fa58c4aaa60"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Pre-approved admin UIDs (replace with your actual UIDs)
const APPROVED_ADMIN_UIDS = [
    "rmbYohSUNjWuJvIxJCT1zp3C8rL2", // Replace with your UID
    // "ANOTHER_ADMIN_UID_IF_NEEDED"
];

// Enhanced login handler with admin registration
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = '';
    
    try {
        // 1. Authenticate user
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // 2. Verify admin status
        if (!APPROVED_ADMIN_UIDS.includes(user.uid)) {
            throw new Error("Not an authorized administrator");
        }

        // 3. Create/update admin record
        await db.collection("admins").doc(user.uid).set({
            email: email,
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
            status: "active",
            ip: await getClientIP() // Optional
        }, { merge: true }); // merge: true preserves existing data

        // 4. Create login audit record
        await db.collection("admin_logs").add({
            uid: user.uid,
            action: "login",
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            userAgent: navigator.userAgent
        });

        // 5. Redirect to dashboard
        window.location.href = "uploadform.html";
        
    } catch (error) {
        console.error("Admin login failed:", error);
        errorEl.textContent = error.message;
        await auth.signOut();
    }
});

// Helper function to get client IP (optional)
async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch {
        return "unknown";
    }
}

// Auto-redirect if already logged in
auth.onAuthStateChanged(async (user) => {
    if (user && APPROVED_ADMIN_UIDS.includes(user.uid)) {
        window.location.href = "uploadform.html";
    }
});