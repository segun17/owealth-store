import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, collection, doc, setDoc, getDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBa9ycHT98M1qtYRH7qjSkl7yvBTVeGyG8",
    authDomain: "sbc-project-d9f9d.firebaseapp.com",
    projectId: "sbc-project-d9f9d",
    storageBucket: "sbc-project-d9f9d.appspot.com",
    messagingSenderId: "808078460193",
    appId: "1:808078460193:web:a65c2c9a379fa58c4aaa60"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let cart = JSON.parse(localStorage.getItem('guestCart')) || {};
let currentUser = null;

// Authentication state management
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        await loadCartFromFirestore(user.uid);
        const guestCart = JSON.parse(localStorage.getItem('guestCart') || '{}');
        if (Object.keys(guestCart).length > 0) {
            await mergeCarts(user.uid, guestCart);
            localStorage.removeItem('guestCart');
        }
    } else {
        cart = JSON.parse(localStorage.getItem('guestCart') || '{}');
        updateCartDisplay();
    }
});

// Cart management functions
async function saveCart() {
    try {
        if (currentUser) {
            await setDoc(doc(db, "carts", currentUser.uid), {
                items: cart,
                timestamp: new Date()
            }, { merge: true });
        } else {
            localStorage.setItem('guestCart', JSON.stringify(cart));
        }
        updateCartDisplay();
    } catch (error) {
        console.error("Save cart error:", error);
    }
}

async function loadCartFromFirestore(userId) {
    try {
        const cartDoc = await getDoc(doc(db, "carts", userId));
        cart = cartDoc.exists() ? cartDoc.data().items : {};
        updateCartDisplay();
    } catch (error) {
        console.error("Load cart error:", error);
    }
}

async function mergeCarts(userId, guestCart) {
    try {
        const userCartRef = doc(db, "carts", userId);
        const userCartDoc = await getDoc(userCartRef);
        const userCart = userCartDoc.exists() ? userCartDoc.data().items : {};

        Object.entries(guestCart).forEach(([productId, quantity]) => {
            const currentQty = userCart[productId] || 0;
            userCart[productId] = currentQty + quantity;
        });

        await setDoc(userCartRef, { items: userCart }, { merge: true });
        cart = userCart;
        updateCartDisplay();
    } catch (error) {
        console.error("Merge cart error:", error);
    }
}

function updateCartDisplay() {
    const totalItems = Object.values(cart).reduce((total, qty) => total + qty, 0);
    document.querySelectorAll('.cart-count').forEach(element => {
        element.textContent = totalItems;
    });
}

// Load categories when page loads
document.addEventListener('DOMContentLoaded', () => {
    const categoriesList = document.getElementById('categoriesList');
    
    const categories = [
        { name: "Home", image: "home-1.webp", category: "Home" },
        { name: "Books", image: "books-1.webp", category: "Books" },
        { name: "Men", image: "mens-1.webp", category: "Men" },
        { name: "Women", image: "womens-2.webp", category: "Women" },
        { name: "Sports", image: "sport-1.webp", category: "Sports" },
        { name: "Jewelry", image: "jewellery-1.webp", category: "Jewelry" },
        { name: "Bags", image: "bags-1.webp", category: "Bags" },
        { name: "Electronics", image: "electronic-3.webp", category: "Electronics" },
        { name: "Toys", image: "toy-1.webp", category: "Toys" },
        { name: "Appliances", image: "appliance-2.webp", category: "Appliances" },
        { name: "Health", image: "health-1.webp", category: "Health" },
        { name: "Automotive", image: "automotive-1.webp", category: "Automotive" }
    ];
    
    categories.forEach(category => {
        const categoryItem = document.createElement('div');
        categoryItem.className = 'category-item';
        
        categoryItem.innerHTML = `
            <img src="images/${category.image}" alt="${category.name}" class="category-image"
                 onerror="this.onerror=null; this.style.display='none'; this.parentNode.innerHTML='<div class=\'category-image\'>${category.name[0]}</div>'">
            <div class="category-name">${category.name}</div>
        `;
        
        // When clicked, store category and go to store page with category parameter
        categoryItem.addEventListener('click', () => {
            localStorage.setItem('selectedCategory', category.category);
            // Pass the category as a URL parameter
            window.location.href = `store.html?category=${encodeURIComponent(category.category)}`;
        });
        
        categoriesList.appendChild(categoryItem);
    });
});