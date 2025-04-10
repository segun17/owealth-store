const firebaseConfig = {
    apiKey: "AIzaSyBa9ycHT98M1qtYRH7qjSkl7yvBTVeGyG8",
    authDomain: "sbc-project-d9f9d.firebaseapp.com",
    projectId: "sbc-project-d9f9d",
    storageBucket: "sbc-project-d9f9d.appspot.com",
    messagingSenderId: "808078460193",
    appId: "1:808078460193:web:a65c2c9a379fa58c4aaa60"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    signOut, 
    onAuthStateChanged,
    onIdTokenChanged 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const profileImage = document.getElementById('profileImage');
const fileInput = document.getElementById('fileInput');
const greetingText = document.getElementById('greetingText');
const greetingName = document.getElementById('greetingName');
const firstNameEl = document.getElementById('firstName');
const lastNameEl = document.getElementById('lastName');
const emailEl = document.getElementById('email');
const phoneEl = document.getElementById('phone');
const signOutLink = document.getElementById('signOutLink');
const refreshProfileBtn = document.getElementById('refreshProfile');
const loadingOverlay = document.getElementById('loadingOverlay');

// Default placeholder image (SVG)
const placeholderImage = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDQuMUMxNi41MzQgNC4xIDIwLjEgNy41NjYgMjAuMSAxMi4xQzIwLjEgMTYuNjM0IDE2LjUzNCAyMC4xIDEyIDIwLjFDNy40NjYgMjAuMSAzLjkgMTYuNjM0IDMuOSAxMi4xQzMuOSA3LjU2NiA3LjQ2NiA0LjEgMTIgNC4xTTEyIDJDNi40NzcgMiAyIDYuNDc3IDIgMTJDNi40NzcgMjIgMTIgMjIgMTIgMjJDNy41MjMgMjIgMjIgMTcuNTIzIDIyIDEyQzIyIDYuNDc3IDE3LjUyMyAyIDEyIDJaIi8+PC9zdmc+";

// Initialize with random greeting
const greetings = [
    "Hello", "Hi there", "Welcome back", "Good to see you", "Hey there",
    "Greetings", "Salutations", "Howdy", "Well hello", "Ahoy there",
    "Bonjour", "Hola", "Ciao", "Namaste", "Aloha", "What's up",
    "How's it going", "Nice to see you", "Looking good", "You're awesome"
];

// Set loading state
function setLoading(isLoading) {
    if (isLoading) {
        loadingOverlay.style.display = 'flex';
    } else {
        loadingOverlay.style.display = 'none';
    }
}

// Show message to user
function showMessage(message, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.style.position = 'fixed';
    messageDiv.style.bottom = '20px';
    messageDiv.style.left = '50%';
    messageDiv.style.transform = 'translateX(-50%)';
    messageDiv.style.padding = '10px 20px';
    messageDiv.style.backgroundColor = isError ? '#ff4444' : '#4CAF50';
    messageDiv.style.color = 'white';
    messageDiv.style.borderRadius = '4px';
    messageDiv.style.zIndex = '1000';
    messageDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        setTimeout(() => messageDiv.remove(), 500);
    }, 3000);
}

// Compress image before upload
async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Set maximum dimensions
                const MAX_WIDTH = 400;
                const MAX_HEIGHT = 400;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
        reader.readAsDataURL(file);
    });
}

// Ensure user document exists
async function ensureUserDocument(userId) {
    try {
        const userRef = doc(db, "users", userId);
        const docSnap = await getDoc(userRef);
        
        if (!docSnap.exists()) {
            await setDoc(userRef, {
                firstName: "",
                lastName: "",
                email: auth.currentUser?.email || "",
                phone: "",
                profilePicture: "",
                lastUpdated: new Date().toISOString()
            }, { merge: true });
        }
        return true;
    } catch (error) {
        console.error("Error ensuring user document:", error);
        throw error;
    }
}

// Save profile picture
async function saveProfilePicture(userId, base64Image) {
    try {
        await ensureUserDocument(userId);
        
        const userRef = doc(db, "users", userId);
        await setDoc(userRef, {
            profilePicture: base64Image,
            lastUpdated: new Date().toISOString()
        }, { merge: true });
        
        localStorage.setItem(`user_${userId}_profilePicture`, base64Image);
        return true;
    } catch (error) {
        console.error("Error saving profile picture:", error);
        showMessage("Failed to save profile picture", true);
        return false;
    }
}

// Handle file upload
async function handleFileUpload(file) {
    const user = auth.currentUser;
    if (!user) {
        showMessage("Please sign in to update your profile", true);
        return false;
    }

    try {
        setLoading(true);
        const originalSrc = profileImage.src;
        profileImage.src = placeholderImage;
        
        const base64Image = await compressImage(file);
        profileImage.src = base64Image;
        
        const success = await saveProfilePicture(user.uid, base64Image);
        if (!success) {
            profileImage.src = originalSrc;
            return false;
        }
        
        showMessage("Profile picture updated successfully!");
        return true;
    } catch (error) {
        console.error("Upload error:", error);
        showMessage("Error processing image", true);
        return false;
    } finally {
        setLoading(false);
    }
}

// Load user profile data
async function loadUserProfile(user) {
    try {
        setLoading(true);
        console.log("Loading profile for user:", user.uid);
        
        // Force fresh data from server
        const userRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(userRef, { source: 'server' });
        
        if (!docSnap.exists()) {
            console.log("No user document found, creating one");
            await ensureUserDocument(user.uid);
            return;
        }

        const userData = docSnap.data();
        console.log("Loaded user data:", userData);
        
        // Update UI
        firstNameEl.textContent = userData.firstName || 'Not set';
        lastNameEl.textContent = userData.lastName || 'Not set';
        emailEl.textContent = user.email || userData.email || 'Not set';
        phoneEl.textContent = userData.phone || 'Not set';
        greetingName.textContent = userData.firstName || 'User';
        greetingText.textContent = greetings[Math.floor(Math.random() * greetings.length)];
        
        // Handle profile picture
        if (userData.profilePicture) {
            profileImage.src = userData.profilePicture;
            localStorage.setItem(`user_${user.uid}_profilePicture`, userData.profilePicture);
        } else {
            const localImage = localStorage.getItem(`user_${user.uid}_profilePicture`);
            profileImage.src = localImage || placeholderImage;
        }
        
    } catch (error) {
        console.error("Error loading profile:", {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        
        if (error.code === 'permission-denied') {
            showMessage("Session expired. Please sign in again.", true);
            await auth.signOut();
            window.location.href = 'login.html';
        } else {
            showMessage("Error loading profile data", true);
            // Fallback to localStorage if available
            const localImage = localStorage.getItem(`user_${user.uid}_profilePicture`);
            if (localImage) {
                profileImage.src = localImage;
            }
        }
    } finally {
        setLoading(false);
    }
}

// Event Listeners
fileInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
        await handleFileUpload(e.target.files[0]);
    }
});

signOutLink.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'continue.html';
    } catch (error) {
        console.error("Sign out error:", error);
        showMessage("Error signing out", true);
    }
});

refreshProfileBtn.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (user) {
        await loadUserProfile(user);
    }
});

// Auth State Management
let authInitialized = false;

onAuthStateChanged(auth, async (user) => {
    if (authInitialized) return;
    authInitialized = true;
    
    if (user) {
        console.log("User authenticated:", user.uid);
        try {
            // Refresh token to ensure it's valid
            await user.getIdToken(true);
            await loadUserProfile(user);
        } catch (error) {
            console.error("Auth refresh error:", error);
            await auth.signOut();
            window.location.href = 'login.html';
        }
    } else {
        console.log("No user signed in, redirecting");
        window.location.href = 'login.html';
    }
});

// Monitor token changes
onIdTokenChanged(auth, async (user) => {
    if (user) {
        console.log("Token refreshed, reloading profile");
        await loadUserProfile(user);
    }
});

// Initial greeting
greetingText.textContent = greetings[Math.floor(Math.random() * greetings.length)];