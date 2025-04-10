import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, collection, doc, setDoc, getDoc, getDocs, writeBatch
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
let currentCategory = "All";
let currentUser = null;
let allProducts = [];
let selectedProductForSearch = null;

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

// Initialize the page
function initializePage() {
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    
    if (categoryParam) {
        currentCategory = categoryParam;
    } else {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        currentCategory = "All";
    }
    
    loadProducts(currentCategory);
    highlightActiveCategory();
    localStorage.removeItem('selectedCategory');
}

function highlightActiveCategory() {
    document.querySelectorAll('.menu-item a').forEach(link => {
        if (link.getAttribute('data-category') === currentCategory) {
            link.style.color = 'white';
            link.style.fontWeight = 'bold';
        } else {
            link.style.color = 'rgb(252, 252, 252)';
            link.style.fontWeight = 'normal';
            link.style.background = 'transparent';
        }
    });
}

document.addEventListener('DOMContentLoaded', initializePage);

// Handle browser back/forward buttons
window.addEventListener('popstate', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const category = urlParams.get('category') || "All";
    currentCategory = category;
    loadProducts(currentCategory);
    highlightActiveCategory();
});

// Modal Functions
function showSuccessModal(productName, productImageUrl) {
    const successModal = document.getElementById('successModal');
    const successModalContent = successModal.querySelector('.success-modal-content');
    
    successModalContent.innerHTML = `
        ${productImageUrl ? `<img src="${productImageUrl}" alt="${productName}">` : ''}
        <p>${productName} added to cart!</p>
    `;
    
    successModal.style.display = 'flex';
    
    setTimeout(() => {
        successModal.style.display = 'none';
    }, 2000);
}

function showAlertModal(message) {
    const alertModal = document.getElementById('alertModal');
    const alertModalMessage = document.getElementById('alertModalMessage');
    
    alertModalMessage.textContent = message;
    alertModal.style.display = 'flex';
}

function hideAlertModal() {
    document.getElementById('alertModal').style.display = 'none';
}

document.getElementById('alertModalButton').addEventListener('click', hideAlertModal);

window.onclick = function(event) {
    if (event.target.id === 'signupModal') {
        document.getElementById('signupModal').style.display = 'none';
    }
    if (event.target.id === 'successModal') {
        document.getElementById('successModal').style.display = 'none';
    }
    if (event.target.id === 'alertModal') {
        hideAlertModal();
    }
};

// Check for and remove deleted products from cart
async function checkForDeletedProducts() {
    try {
        if (!currentUser) return;

        const cartItems = {...cart};
        const productIds = Object.keys(cartItems);
        if (productIds.length === 0) return;

        // Check which products still exist
        const productSnapshots = await Promise.all(
            productIds.map(id => getDoc(doc(db, "products", id)))
        );

        const deletedProducts = [];
        productSnapshots.forEach((snapshot, index) => {
            if (!snapshot.exists()) {
                deletedProducts.push(productIds[index]);
                delete cartItems[productIds[index]];
            }
        });

        if (deletedProducts.length > 0) {
            // Update cart with removed items
            cart = cartItems;
            await saveCart();
            
            // Get names of deleted products
            const productNames = await Promise.all(
                deletedProducts.map(async productId => {
                    try {
                        const productDoc = await getDoc(doc(db, "products", productId));
                        return productDoc.exists() ? productDoc.data().name : `Product ${productId}`;
                    } catch {
                        return `Product ${productId}`;
                    }
                })
            );
            
            showAlertModal(
                `These items were removed from your cart as they're no longer available:\n` +
                productNames.join('\n') +
                `\n\nYour cart has been updated.`
            );
        }
    } catch (error) {
        console.error("Error checking for deleted products:", error);
    }
}

// Cart validation and cleanup
async function validateAndCleanCart() {
    try {
        if (!currentUser) return false;
        
        // First check for deleted products
        await checkForDeletedProducts();
        
        const cartItems = {...cart};
        const productSnapshots = await getDocs(collection(db, "products"));
        
        const stockInfo = {};
        const outOfStockItems = [];
        
        productSnapshots.forEach(doc => {
            stockInfo[doc.id] = doc.data().stock || 0;
        });

        // Check stock for all items in cart
        for (const [productId, quantity] of Object.entries(cartItems)) {
            if (!stockInfo.hasOwnProperty(productId)) {
                // Product was deleted
                outOfStockItems.push(productId);
                delete cartItems[productId];
            } else if (stockInfo[productId] < quantity) {
                outOfStockItems.push(productId);
                delete cartItems[productId];
            }
        }

        if (outOfStockItems.length > 0) {
            // Update cart with removed items
            cart = cartItems;
            await saveCart();
            
            // Get names of removed products
            const productNames = await Promise.all(
                outOfStockItems.map(async productId => {
                    const productDoc = await getDoc(doc(db, "products", productId));
                    return productDoc.exists() ? productDoc.data().name : `Product ${productId}`;
                })
            );
            
            showAlertModal(
                `These items were removed from your cart:\n` +
                productNames.join('\n') +
                `\n\nYour cart has been updated.`
            );
            return false;
        }

        return true;
    } catch (error) {
        console.error("Cart validation error:", error);
        showAlertModal("Failed to validate cart");
        return false;
    }
}

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
        showAlertModal("Failed to save cart");
    }
}

async function loadCartFromFirestore(userId) {
    try {
        const cartDoc = await getDoc(doc(db, "carts", userId));
        cart = cartDoc.exists() ? cartDoc.data().items : {};
        
        // Check for deleted products whenever we load the cart
        await checkForDeletedProducts();
        
        updateCartDisplay();
    } catch (error) {
        console.error("Load cart error:", error);
        showAlertModal("Failed to load cart");
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
        
        // Check for deleted products after merging
        await checkForDeletedProducts();
        
        updateCartDisplay();
    } catch (error) {
        console.error("Merge cart error:", error);
        showAlertModal("Failed to merge carts");
    }
}

function updateCartDisplay() {
    const totalItems = Object.values(cart).reduce((total, qty) => total + qty, 0);
    document.querySelectorAll('.cart-count').forEach(element => {
        element.textContent = totalItems;
    });
}

async function addToCart(productId, quantity = 1) {
    try {
        if (!currentUser) {
            document.getElementById('signupModal').style.display = 'flex';
            return false;
        }

        // First check if product exists and has stock
        const productRef = doc(db, "products", productId);
        const productDoc = await getDoc(productRef);
        
        if (!productDoc.exists()) {
            showAlertModal("Product not found");
            return false;
        }
        
        const product = productDoc.data();
        const currentStock = product.stock || 0;
        
        // Check if product is out of stock
        if (currentStock <= 0) {
            showAlertModal("This product is out of stock!");
            return false;
        }

        // Get current quantity in cart
        const currentQtyInCart = cart[productId] || 0;
        
        // Check if requested quantity + current cart quantity exceeds available stock
        if ((currentQtyInCart + quantity) > currentStock) {
            const remainingStock = currentStock - currentQtyInCart;
            if (remainingStock <= 0) {
                showAlertModal("You've already added all available stock to your cart");
            } else {
                showAlertModal(`Only ${remainingStock} more items available. You can't add ${quantity} more.`);
            }
            return false;
        }

        // Add to cart without reducing stock
        cart[productId] = currentQtyInCart + quantity;
        updateCartDisplay();
        await saveCart();
        
        showSuccessModal(product.name, product.imageUrl);
        return true;
    } catch (error) {
        console.error("Add to cart error:", error);
        showAlertModal("Failed to add item");
        return false;
    }
}


// Complete purchase function
async function completePurchase(userId) {
    try {
        // Get the user's cart
        const cartDoc = await getDoc(doc(db, "carts", userId));
        if (!cartDoc.exists()) {
            throw "Cart not found";
        }
        
        const cartItems = cartDoc.data().items;
        if (!cartItems || Object.keys(cartItems).length === 0) {
            throw "Cart is empty";
        }

        // First validate all items have sufficient stock
        const productSnapshots = await getDocs(collection(db, "products"));
        
        const stockValidation = {};
        productSnapshots.forEach(doc => {
            stockValidation[doc.id] = doc.data().stock || 0;
        });

        // Check stock for all items
        for (const [productId, quantity] of Object.entries(cartItems)) {
            if (!stockValidation.hasOwnProperty(productId)) {
                throw `Product ${productId} is no longer available`;
            }
            if (stockValidation[productId] < quantity) {
                throw `Product ${productId} only has ${stockValidation[productId]} items left`;
            }
        }

        // If all items have sufficient stock, reduce stock in a batch write
        const batch = writeBatch(db);
        
        for (const [productId, quantity] of Object.entries(cartItems)) {
            const productRef = doc(db, "products", productId);
            batch.update(productRef, {
                stock: stockValidation[productId] - quantity
            });
        }

        // Clear the cart
        batch.set(doc(db, "carts", userId), { items: {} }, { merge: true });
        
        // Commit the batch
        await batch.commit();
        
        // Update local cart
        cart = {};
        updateCartDisplay();
        
        return true;
    } catch (error) {
        console.error("Payment error:", error);
        showAlertModal(typeof error === 'string' ? error : "Payment failed");
        return false;
    }
}

function showSignupModal() {
    document.getElementById('signupModal').style.display = 'flex';
}

document.getElementById('modalSignupButton').addEventListener('click', () => {
    window.location.href = 'continue.html';
});

function showProductDetail(product) {
    if (!currentUser) {
        showSignupModal();
        return;
    }

    const detailPage = document.getElementById('productDetailPage');
    const detailImage = document.getElementById('productDetailImage');
    const detailDescription = document.getElementById('productDetailDescription');

    // Get current quantity in cart for this product
    const currentCartQuantity = cart[product.id] || 0;
    
    detailImage.src = product.imageUrl || '';
    detailDescription.innerHTML = `
        <div class="product-name-detail">${product.name}</div>
        <p class="stock-detail">
            ${(product.stock || 0) > 0 ? 
                `Stock: ${product.stock}` : 
                'Out of Stock'}
        </p>
        <p>${product.description || 'No description available'}</p>
        <p class="product-price">₦${(product.price || 0).toLocaleString()}</p>
        <div class="quantity-control">
            <div class="quantity-container">
                <span class="quantity-label">Qty:</span>
                <button class="quantity-button" id="decreaseQuantity">-</button>
                <span class="quantity-display" id="quantityDisplay">${currentCartQuantity > 0 ? currentCartQuantity : 1}</span>
                <button class="quantity-button" id="increaseQuantity">+</button>
            </div>
            <span class="Add">Added: ${currentCartQuantity}</span>
        </div>
        <div class="bottomCart">
            <button id="addToCartButton" style="width: 100%;" 
                    ${(product.stock || 0) <= 0 ? 'disabled' : ''}>
                ${(product.stock || 0) > 0 ? "Add to Cart" : "Out of Stock"}
            </button>
        </div>
    `;

    // Initialize quantity with current cart quantity or 1
    let quantity = currentCartQuantity > 0 ? currentCartQuantity : 1;
    const quantityDisplay = document.getElementById('quantityDisplay');
    const decreaseBtn = document.getElementById('decreaseQuantity');
    const increaseBtn = document.getElementById('increaseQuantity');
    const addToCartBtn = document.getElementById('addToCartButton');

    decreaseBtn.addEventListener('click', () => {
        if (quantity > 1) {
            quantity--;
            quantityDisplay.textContent = quantity;
        }
    });

    increaseBtn.addEventListener('click', () => {
        const currentQtyInCart = cart[product.id] || 0;
        const available = product.stock - currentQtyInCart;
        
        if (quantity < available) {
            quantity++;
            quantityDisplay.textContent = quantity;
        } else {
            showAlertModal(`Only ${available} more items available`);
        }
    });

    addToCartBtn.addEventListener('click', async () => {
        const currentQtyInCart = cart[product.id] || 0;
        const available = product.stock - currentQtyInCart;
        
        if (quantity > available) {
            showAlertModal(`Only ${available} more items available`);
            return;
        }
        
        const added = await addToCart(product.id, quantity);
        if (added) {
            // Update the "Added" display with new total
            document.querySelector('.Add').textContent = `Added: ${cart[product.id]}`;
            // Reset quantity display to 1 for next addition
            quantity = 1;
            quantityDisplay.textContent = quantity;
        }
    });

    document.getElementById('header').classList.add('hidden');
    document.getElementById('mainContainer').classList.add('hidden');
    document.querySelector('.footer').classList.add('hidden');
    detailPage.style.display = 'flex';
}

async function loadProducts(category = "All", searchQuery = "") {
try {
    const productList = document.getElementById('productList');
    productList.innerHTML = '';
    
    const snapshot = await getDocs(collection(db, "products"));
    allProducts = [];

    snapshot.forEach(doc => {
        const product = doc.data();
        product.id = doc.id;
        
        // Set defaults if fields are missing
        product.name = product.name || "Unnamed Product";
        product.imageUrl = product.imageUrl || "default-image.jpg";
        product.price = product.price || 0;
        product.stock = product.stock || 0;
        product.category = product.category || "Uncategorized";
        product.rating = product.rating || 0; // Ensure rating exists
        
        allProducts.push(product);
    });

    // Filter products based on category and search query
    const filteredProducts = allProducts.filter(product => {
        const categoryMatch = category === "All" || product.category === category;
        const searchMatch = !searchQuery || 
                         product.name.toLowerCase().includes(searchQuery.toLowerCase());
        return categoryMatch && searchMatch;
    });

    // Display filtered products
    filteredProducts.forEach(product => {
        const productDiv = document.createElement('div');
        productDiv.className = 'product-container';
        
        // Generate star icons for rating
        const starIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="black"><path d="M12 .587l3.668 7.431 8.167 1.183-5.917 5.776 1.396 8.146L12 18.896l-7.314 3.827 1.396-8.146L.165 9.201l8.167-1.183L12 .587z"/></svg>';
        const halfStarIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="black"><path d="M12 .587l3.668 7.431 8.167 1.183-5.917 5.776 1.396 8.146L12 18.896l-7.314 3.827 1.396-8.146L.165 9.201l8.167-1.183L12 .587z" fill="url(#half-gradient)"/><defs><linearGradient id="half-gradient" x1="0" y1="0" x2="100%" y2="0"><stop offset="50%" stop-color="black"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs></svg>';

        let stars = '';
        const fullStars = Math.floor(product.rating); // Get the full stars
        const hasHalfStar = product.rating % 1 !== 0; // Check if there's a half star

        // Add full stars
        for (let i = 0; i < fullStars; i++) {
            stars += starIcon;
        }

        // Add half star if applicable
        if (hasHalfStar) {
            stars += halfStarIcon;
        }

        // Add empty stars for the remaining
        const remainingStars = 5 - Math.ceil(product.rating); // Calculate remaining stars
        for (let i = 0; i < remainingStars; i++) {
            stars += starIcon.replace('fill="black"', 'fill="transparent"'); // Transparent fill for empty stars
        }
        
        productDiv.innerHTML = `
            <div class="product-img">
                <img src="${product.imageUrl}" alt="${product.name}">
            </div>
            <div class="product-details">
                <p id="product-name" title="${product.name}">${product.name}</p>
                <div class="stock-info">
                    ${product.stock > 0 ? 
                        `<span class="in-stock">${product.stock} left</span>` : 
                        `<span class="sold-out">sold-out</span>`}
                </div>
                <div class="rating">${stars}</div>
                <div class="cart-price">
                    <div class="product-price">₦${product.price.toLocaleString()}</div>
                    <div id="cart" ${product.stock <= 0 ? 'style="opacity:0.5; cursor:not-allowed;"' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24" fill="none">
                            <path d="M21 5L19 12H7.37671M20 16H8L6 3H3M16 5.5H13.5M13.5 5.5H11M13.5 5.5V8M13.5 5.5V3M9 20C9 20.5523 8.55228 21 8 21C7.44772 21 7 20.5523 7 20C7 19.4477 7.44772 19 8 19C8.55228 19 9 19.4477 9 20ZM20 20C20 20.5523 19.5523 21 19 21C18.4477 21 18 20.5523 18 20C18 19.4477 18.4477 19 19 19C19.5523 19 20 19.4477 20 20Z" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                </div>
            </div>
        `;

        productList.appendChild(productDiv);

        const productImage = productDiv.querySelector('.product-img img');
        productImage.addEventListener('click', () => {
            sessionStorage.setItem('previousCategory', currentCategory);
            showProductDetail(product);
        });

        if (product.stock > 0) {
            const cartIcon = productDiv.querySelector('#cart');
            cartIcon.addEventListener('click', async (e) => {
                if (!currentUser) {
                    e.preventDefault();
                    showSignupModal();
                    return;
                }
                const added = await addToCart(product.id, 1);
            });
        }
    });

    // Handle product to show from session storage
    const productToShow = sessionStorage.getItem('productToShow');
    if (productToShow) {
        sessionStorage.removeItem('productToShow');
        setTimeout(() => {
            showProductDetail(JSON.parse(productToShow));
        }, 100);
    }
} catch (error) {
    console.error("Product load error:", error);
    showAlertModal("Failed to load products");
}
}

function showSearchResults(query) {
    const dropdown = document.getElementById('searchResultsDropdown');
    dropdown.innerHTML = '';
    
    if (!query || query.length < 2) {
        dropdown.style.display = 'none';
        selectedProductForSearch = null;
        return;
    }
    
    const matchingProducts = allProducts.filter(product => {
        return product && product.name && 
            product.name.toLowerCase().includes(query.toLowerCase());
    }).slice(0, 5);
    
    if (matchingProducts.length === 0) {
        dropdown.style.display = 'none';
        selectedProductForSearch = null;
        return;
    }
    
    matchingProducts.forEach(product => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
            <img src="${product.imageUrl || ''}" alt="${product.name || ''}">
            <span>${product.name || 'No name'}</span>
        `;
        item.addEventListener('click', () => {
            selectedProductForSearch = product;
            document.getElementById('searchInput').value = product.name || '';
            dropdown.style.display = 'none';
        });
        dropdown.appendChild(item);
    });
    
    dropdown.style.display = 'block';
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    showSearchResults(query);
    
    if (query === '') {
        loadProducts(currentCategory);
    }
});

document.getElementById('searchButton').addEventListener('click', () => {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    
    if (selectedProductForSearch) {
        currentCategory = selectedProductForSearch.category || "All";
        window.history.pushState({}, '', `?category=${currentCategory}`);
        loadProducts(currentCategory);
        highlightActiveCategory();
        
        setTimeout(() => {
            const productElements = document.querySelectorAll('.product-container');
            productElements.forEach(element => {
                if (element.querySelector('#product-name').textContent === selectedProductForSearch.name) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.style.border = '2px solid orange';
                    setTimeout(() => {
                        element.style.border = '1px solid #ccc';
                    }, 3000);
                }
            });
        }, 500);
        
        selectedProductForSearch = null;
        searchInput.value = '';
        document.getElementById('searchResultsDropdown').style.display = 'none';
    } else if (query) {
        loadProducts(currentCategory, query);
        document.getElementById('searchResultsDropdown').style.display = 'none';
    } else {
        loadProducts(currentCategory);
    }
});

document.querySelectorAll('.menu-item a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        currentCategory = link.getAttribute('data-category');
        window.history.pushState({}, '', `?category=${currentCategory}`);
        loadProducts(currentCategory);
        highlightActiveCategory();
        document.getElementById('searchInput').value = '';
        document.getElementById('searchResultsDropdown').style.display = 'none';
        selectedProductForSearch = null;
    });
});

document.getElementById('backButton').addEventListener('click', () => {
    document.getElementById('header').classList.remove('hidden');
    document.getElementById('mainContainer').classList.remove('hidden');
    document.querySelector('.footer').classList.remove('hidden');
    document.getElementById('productDetailPage').style.display = 'none';
    loadProducts(sessionStorage.getItem('previousCategory') || "All");
});

document.getElementById('profileLink').addEventListener('click', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        showSignupModal();
        return;
    }
    
    await saveCart();
    window.location.href = 'profile.html';
});

document.querySelector('.content-holder[href="cartfooter.html"]').addEventListener('click', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        showSignupModal();
        return;
    }
    
    // Check for deleted products before going to cart
    await checkForDeletedProducts();
    
    const isValid = await validateAndCleanCart();
    if (isValid) {
        await saveCart();
        window.location.href = 'cartfooter.html';
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.div1-search-container')) {
        document.getElementById('searchResultsDropdown').style.display = 'none';
    }
});

// Add this to your existing script
document.addEventListener('DOMContentLoaded', function() {
        // Show welcome page initially
        const welcomePage = document.getElementById('welcomePage');
        const header = document.getElementById('header');
        
        // After 3 seconds, hide welcome and show main content
        setTimeout(() => {
            welcomePage.classList.add('hidden');
            header.classList.remove('hidden');
            
            // Initialize your store as usual
            initializePage(); // Your existing initialization function
        }, 3000);
        
        // Optional: Click to skip
        welcomePage.addEventListener('click', function() {
            welcomePage.classList.add('hidden');
            header.classList.remove('hidden');
            initializePage();
        });
    });