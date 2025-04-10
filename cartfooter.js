import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc,
    collection,
    getDocs
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

let currentUser = null;
let cartData = {};

// Handle authentication state
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadCart();
    } else {
        window.location.href = 'login.html';
    }
});

// Back button functionality
document.getElementById('cartBackButton').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'store.html';
});

// Checkout button functionality
document.getElementById('checkoutButton').addEventListener('click', async () => {
    if (Object.keys(cartData).length === 0) {
        alert("Your cart is empty!");
        return;
    }
    
    // Final validation before checkout
    const isValid = await validateCart();
    if (isValid) {
        window.location.href = 'checkout.html';
    }
});

async function validateCart() {
    try {
        const productsSnapshot = await getDocs(collection(db, "products"));
        const stockInfo = {};
        productsSnapshot.forEach(doc => {
            stockInfo[doc.id] = doc.data().stock || 0;
        });

        const outOfStockItems = [];
        const updatedCart = {...cartData};

        for (const [productId, quantity] of Object.entries(cartData)) {
            if (stockInfo[productId] < quantity) {
                outOfStockItems.push(productId);
                delete updatedCart[productId];
            }
        }

        if (outOfStockItems.length > 0) {
            // Update cart with removed items
            await setDoc(doc(db, "carts", currentUser.uid), {
                items: updatedCart
            });

            // Get names of removed products
            const productNames = await Promise.all(
                outOfStockItems.map(async productId => {
                    const productDoc = await getDoc(doc(db, "products", productId));
                    return productDoc.exists() ? productDoc.data().name : `Product ${productId}`;
                })
            );

            alert(
                `These items were removed from your cart as they're out of stock:\n` +
                productNames.join('\n') +
                `\n\nPlease review your cart before proceeding to checkout.`
            );

            cartData = updatedCart;
            loadCart();
            return false;
        }

        return true;
    } catch (error) {
        console.error("Validation error:", error);
        alert("Failed to validate cart. Please try again.");
        return false;
    }
}

async function loadCart() {
    try {
        const cartContainer = document.getElementById('cartContainer');
        const cartTotalAmount = document.getElementById('cartTotalAmount');
        const checkoutTotal = document.getElementById('checkoutTotal');

        cartContainer.innerHTML = '<div class="loading">Loading your cart...</div>';
        cartTotalAmount.textContent = '₦0';
        checkoutTotal.textContent = '0';

        const cartDoc = await getDoc(doc(db, "carts", currentUser.uid));
        if (!cartDoc.exists()) {
            cartContainer.innerHTML = '<p>Your cart is empty</p>';
            cartData = {};
            return;
        }

        cartData = cartDoc.data().items || {};
        if (Object.keys(cartData).length === 0) {
            cartContainer.innerHTML = '<p>Your cart is empty</p>';
            return;
        }

        // Get all products in one query
        const productsSnapshot = await getDocs(collection(db, "products"));
        const products = {};
        productsSnapshot.forEach(doc => {
            products[doc.id] = doc.data();
        });

        let totalAmount = 0;
        cartContainer.innerHTML = '';

        for (const [productId, quantity] of Object.entries(cartData)) {
            const product = products[productId];
            if (!product) continue;

            totalAmount += product.price * quantity;

            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            cartItem.innerHTML = `
                <img src="${product.imageUrl || 'https://via.placeholder.com/90'}" alt="${product.name}">
                <div class="cart-item-details">
                    <h3>${product.name}</h3>
                    <p>₦${product.price.toLocaleString()} x ${quantity}</p>
                </div>
                <div class="cart-item-actions">
                    <button data-product="${productId}">Remove</button>
                </div>
            `;
            cartContainer.appendChild(cartItem);
        }

        // Update totals
        const formattedTotal = totalAmount.toLocaleString();
        cartTotalAmount.textContent = `₦${formattedTotal}`;
        checkoutTotal.textContent = formattedTotal;

        // Add remove event listeners
        document.querySelectorAll('.cart-item-actions button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                removeFromCart(button.dataset.product);
            });
        });

    } catch (error) {
        console.error("Error loading cart:", error);
        const cartContainer = document.getElementById('cartContainer');
        cartContainer.innerHTML = '<p>Error loading cart. Please try again.</p>';
    }
}

async function removeFromCart(productId) {
    try {
        const cartRef = doc(db, "carts", currentUser.uid);
        const updatedCart = {...cartData};
        delete updatedCart[productId];
        
        await setDoc(cartRef, { items: updatedCart });
        cartData = updatedCart;
        loadCart();
    } catch (error) {
        console.error("Error removing item:", error);
        alert("Failed to remove item. Please try again.");
    }
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    if (!currentUser) return;
    loadCart();
});