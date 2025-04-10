 // Firebase Configuration (Replace with your actual config)
 const firebaseConfig = {
    apiKey: "AIzaSyBa9ycHT98M1qtYRH7qjSkl7yvBTVeGyG8",
    authDomain: "sbc-project-d9f9d.firebaseapp.com",
    projectId: "sbc-project-d9f9d",
    storageBucket: "sbc-project-d9f9d.appspot.com",
    messagingSenderId: "808078460193",
    appId: "1:808078460193:web:a65c2c9a379fa58c4aaa60"
};

// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    sendEmailVerification,
    onAuthStateChanged,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State variables
let unverifiedUser = null;
let cleanupTimer = null;

// Password toggle functionality
document.querySelector('.toggle-password').addEventListener('click', () => {
    const passwordInput = document.getElementById('password');
    const toggleButton = document.querySelector('.toggle-password svg');
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    toggleButton.classList.toggle('active');
});

// Cleanup unverified users
async function cleanupUnverifiedUser(user) {
    try {
        if (user) {
            await deleteUser(user);
            await deleteDoc(doc(db, 'users', user.uid));
            console.log('Unverified user cleaned up');
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Form submission handler
document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('errorMessage');
    
    try {
        loader.style.display = 'block';
        errorMessage.style.display = 'none';

        // Collect form data
        const userData = {
            firstName: document.getElementById('firstName').value.trim(),
            lastName: document.getElementById('lastName').value.trim(),
            phone: `+${document.getElementById('countryCode').value}${document.getElementById('phone').value.trim()}`,
            email: document.getElementById('email').value.trim().toLowerCase(),
            password: document.getElementById('password').value.trim()
        };

        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(
            auth, 
            userData.email, 
            userData.password
        );

        // Store additional data in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            ...userData,
            createdAt: new Date(),
            emailVerified: false,
            roles: ['user'],
            lastLogin: new Date()
        });

        // Send verification email
        await sendEmailVerification(userCredential.user);
        document.getElementById('verificationModal').style.display = 'flex';
        unverifiedUser = userCredential.user;

        // Set cleanup timer (10 minutes)
        cleanupTimer = setTimeout(async () => {
            if (unverifiedUser && !unverifiedUser.emailVerified) {
                await cleanupUnverifiedUser(unverifiedUser);
                showError('Verification timeout. Please sign up again.');
            }
        }, 600000);

    } catch (error) {
        console.error('Signup Error:', error);
        if (unverifiedUser) await cleanupUnverifiedUser(unverifiedUser);
        showError(handleAuthError(error));
    } finally {
        loader.style.display = 'none';
    }
});

// Auth state listener
onAuthStateChanged(auth, async (user) => {
    if (user && user.emailVerified) {
        clearTimeout(cleanupTimer);
        window.location.href = 'profile.html';
    }
});

// Verification success handler
window.handleVerifiedClick = async () => {
    const verifiedButton = document.getElementById('verifiedButton');
    const modalLoader = document.getElementById('modalLoader');
    
    try {
        verifiedButton.disabled = true;
        modalLoader.style.display = 'block';
        
        const user = auth.currentUser;
        if (user) {
            await user.reload();
            if (user.emailVerified) {
                window.location.href = 'store.html';
            } else {
                await cleanupUnverifiedUser(user);
                showError('Email not verified. Account removed.');
                document.getElementById('verificationSuccessModal').style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Verification check error:', error);
        showError('Error verifying email status. Please try again.');
    } finally {
        verifiedButton.disabled = false;
        modalLoader.style.display = 'none';
    }
};

// Error handling utilities
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function handleAuthError(error) {
    console.error('Authentication Error:', error);
    switch(error.code) {
        case 'auth/email-already-in-use':
            return 'This email is already registered.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/weak-password':
            return 'Password should be at least 6 characters.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Try again later.';
        case 'permission-denied':
            return 'Database permission denied. Contact support.';
        case 'auth/operation-not-allowed':
            return 'Email/password signup is disabled.';
        default:
            return `Error: ${error.message}`;
    }
}

// Modal controls
window.closeVerificationModal = () => {
    document.getElementById('verificationModal').style.display = 'none';
    document.getElementById('verificationSuccessModal').style.display = 'flex';
};