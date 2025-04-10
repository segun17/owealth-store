import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc,
    getDocs, 
    collection,
    writeBatch,
    serverTimestamp,
    increment,
    query,      
    where,      
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Your Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBa9ycHT98M1qtYRH7qjSkl7yvBTVeGyG8",
    authDomain: "sbc-project-d9f9d.firebaseapp.com",
    projectId: "sbc-project-d9f9d",
    storageBucket: "sbc-project-d9f9d.appspot.com",
    messagingSenderId: "808078460193",
    appId: "1:808078460193:web:a65c2c9a379fa58c4aaa60"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Paystack Configuration
const config = {
    paystackPublicKey: 'pk_test_ab45552e0a4c3b13a20abc9a025c3260e4260faa',
    currency: 'NGN'
};

// State management
const state = {
    currentStep: 1,
    order: {
        items: [],
        subtotal: 0,
        shipping: 0,
        total: 0,
        customer: {},
        shippingInfo: {}
    },
    products: {}
};

// DOM Elements
const elements = {
    steps: {
        step1: document.getElementById('step1'),
        step2: document.getElementById('step2'),
        step3: document.getElementById('step3')
    },
    panels: {
        customerInfo: document.getElementById('customerInfoPanel'),
        shipping: document.getElementById('shippingPanel'),
        payment: document.getElementById('paymentPanel'),
        confirmation: document.getElementById('confirmationPanel')
    },
    buttons: {
        continueToShipping: document.getElementById('continueToShipping'),
        continueToPayment: document.getElementById('continueToPayment'),
        payButton: document.getElementById('payButton')
    },
    errorMessages: {
        customerInfo: document.getElementById('customerInfoError'),
        shipping: document.getElementById('shippingError'),
        payment: document.getElementById('paymentError')
    },
    inputs: {
        email: document.getElementById('email'),
        firstName: document.getElementById('firstName'),
        lastName: document.getElementById('lastName'),
        address: document.getElementById('address'),
        city: document.getElementById('city'),
        state: document.getElementById('state'),
        phone: document.getElementById('phone')
    },
    orderItems: document.getElementById('orderItems'),
    orderTotal: document.getElementById('orderTotal'),
    confirmationContent: document.getElementById('confirmationContent')
};

// Initialize the checkout
function initCheckout() {
    // Set up auth state listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in
            state.order.customer.uid = user.uid;
            state.order.customer.email = user.email || '';
            elements.inputs.email.value = user.email || '';
            
            // Load cart items from Firestore
            loadCartItems(user.uid);
        } else {
            // User is signed out - redirect to login
            window.location.href = 'login.html';
        }
    });
    
    // Set up event listeners
    setupEventListeners();
}

// Load cart items from Firestore
async function loadCartItems(userId) {
    try {
        // Show loading state
        elements.orderItems.innerHTML = '<p>Loading your cart...</p>';
        
        // Get the user's cart
        const cartRef = doc(db, "carts", userId);
        const cartSnap = await getDoc(cartRef);
        
        if (!cartSnap.exists()) {
            elements.orderItems.innerHTML = '<p>Your cart is empty</p>';
            elements.buttons.payButton.disabled = true;
            return;
        }
        
        const cartData = cartSnap.data();
        
        if (!cartData.items || Object.keys(cartData.items).length === 0) {
            elements.orderItems.innerHTML = '<p>Your cart is empty</p>';
            elements.buttons.payButton.disabled = true;
            return;
        }
        
        // Get all product IDs in the cart
        const productIds = Object.keys(cartData.items);
        
        // Fetch all products in the cart
        const productsQuery = query(
            collection(db, "products"),
            where("__name__", "in", productIds)
        );
        
        const productsSnap = await getDocs(productsQuery);
        
        // Cache product data
        productsSnap.forEach(doc => {
            state.products[doc.id] = doc.data();
        });
        
        // Build order items array
        state.order.items = productIds.map(id => {
            const product = state.products[id];
            const quantity = cartData.items[id];
            const stock = product?.stock || 0;
            
            return {
                id: id,
                name: product?.name || 'Unknown Product',
                price: product?.price || 0,
                quantity: quantity,
                stock: stock,
                image: product?.imageUrl || 'https://via.placeholder.com/60'
            };
        });
        
        // Calculate totals
        calculateTotals();
        
        // Display items
        displayOrderItems();
        
    } catch (error) {
        console.error("Error loading cart:", error);
        elements.orderItems.innerHTML = `
            <p class="error">Error loading your cart</p>
            <button onclick="loadCartItems('${userId}')" class="btn">Try Again</button>
        `;
        elements.buttons.payButton.disabled = true;
    }
}

// Calculate order totals
function calculateTotals() {
    state.order.subtotal = state.order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    state.order.shipping = 1000; // Flat rate shipping for demo
    state.order.total = state.order.subtotal + state.order.shipping;
}

// Display order items in the summary
function displayOrderItems() {
    elements.orderItems.innerHTML = '';
    
    state.order.items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'order-item';
        
        // Check stock availability
        const stockWarning = item.stock < item.quantity ? 
            `<div class="stock-warning ${item.stock <= 0 ? 'out-of-stock' : ''}">
                ${item.stock <= 0 ? 'Out of stock' : `Only ${item.stock} left in stock`}
            </div>` : '';
        
        itemElement.innerHTML = `
            <img src="${item.image}" alt="${item.name}" class="order-item-image">
            <div class="order-item-details">
                <h4 class="order-item-title">${item.name}</h4>
                <p class="order-item-price">₦${(item.price * item.quantity).toLocaleString()}</p>
                ${stockWarning}
            </div>
        `;
        elements.orderItems.appendChild(itemElement);
    });
    
    // Add shipping if applicable
    if (state.order.shipping > 0) {
        const shippingElement = document.createElement('div');
        shippingElement.className = 'order-item';
        shippingElement.innerHTML = `
            <div style="width: 60px;"></div>
            <div class="order-item-details">
                <h4 class="order-item-title">Shipping</h4>
            </div>
            <div>₦${state.order.shipping.toLocaleString()}</div>
        `;
        elements.orderItems.appendChild(shippingElement);
    }
    
    // Update total
    elements.orderTotal.textContent = `Total: ₦${state.order.total.toLocaleString()}`;
    
    // Disable pay button if any items are out of stock
    const outOfStock = state.order.items.some(item => item.stock <= 0);
    elements.buttons.payButton.disabled = outOfStock;
    
    if (outOfStock) {
        showError('payment', 'Some items in your cart are out of stock. Please remove them to proceed.');
    } else {
        hideError('payment');
    }
}

// Set up event listeners
function setupEventListeners() {
    // Continue to shipping
    elements.buttons.continueToShipping.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Validate customer info
        if (!validateCustomerInfo()) {
            return;
        }
        
        // Save customer info
        state.order.customer = {
            ...state.order.customer,
            email: elements.inputs.email.value.trim(),
            firstName: elements.inputs.firstName.value.trim(),
            lastName: elements.inputs.lastName.value.trim()
        };
        
        // Move to next step
        goToStep(2);
    });
    
    // Continue to payment
    elements.buttons.continueToPayment.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Validate shipping info
        if (!validateShippingInfo()) {
            return;
        }
        
        // Save shipping info
        state.order.shippingInfo = {
            address: elements.inputs.address.value.trim(),
            city: elements.inputs.city.value.trim(),
            state: elements.inputs.state.value,
            phone: elements.inputs.phone.value.trim()
        };
        
        // Move to next step
        goToStep(3);
    });
    
    // Pay button
    elements.buttons.payButton.addEventListener('click', (e) => {
        e.preventDefault();
        processPayment();
    });
}

// Validate customer info
function validateCustomerInfo() {
    const email = elements.inputs.email.value.trim();
    const firstName = elements.inputs.firstName.value.trim();
    const lastName = elements.inputs.lastName.value.trim();
    
    if (!email || !firstName || !lastName) {
        showError('customerInfo', 'Please fill in all required fields');
        return false;
    }
    
    if (!isValidEmail(email)) {
        showError('customerInfo', 'Please enter a valid email address');
        return false;
    }
    
    hideError('customerInfo');
    return true;
}

// Validate shipping info
function validateShippingInfo() {
    const address = elements.inputs.address.value.trim();
    const city = elements.inputs.city.value.trim();
    const stateVal = elements.inputs.state.value;
    const phone = elements.inputs.phone.value.trim();
    
    if (!address || !city || !stateVal || !phone) {
        showError('shipping', 'Please fill in all required fields');
        return false;
    }
    
    hideError('shipping');
    return true;
}

// Simple email validation
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Show error message
function showError(section, message) {
    elements.errorMessages[section].textContent = message;
    elements.errorMessages[section].classList.remove('hidden');
}

// Hide error message
function hideError(section) {
    elements.errorMessages[section].classList.add('hidden');
}

// Navigate between steps
function goToStep(step) {
    // Hide all panels
    Object.values(elements.panels).forEach(panel => {
        panel.classList.add('hidden');
    });
    
    // Reset step styling
    Object.values(elements.steps).forEach(stepEl => {
        stepEl.classList.remove('active', 'completed');
    });
    
    // Update current step
    state.currentStep = step;
    
    // Show current panel and update steps
    switch (step) {
        case 1:
            elements.panels.customerInfo.classList.remove('hidden');
            elements.steps.step1.classList.add('active');
            break;
        case 2:
            elements.panels.shipping.classList.remove('hidden');
            elements.steps.step1.classList.add('completed');
            elements.steps.step2.classList.add('active');
            break;
        case 3:
            elements.panels.payment.classList.remove('hidden');
            elements.steps.step1.classList.add('completed');
            elements.steps.step2.classList.add('completed');
            elements.steps.step3.classList.add('active');
            break;
    }
}

// Process payment with Paystack
function processPayment() {
    // Check network connection first
    if (!navigator.onLine) {
        showError('payment', 'No internet connection. Please check your network.');
        return;
    }
    
    // Check if Paystack is loaded
    if (typeof PaystackPop === 'undefined') {
        showError('payment', 'Payment system is loading. Please wait...');
        setTimeout(processPayment, 1000); // Retry after 1 second
        return;
    }
    
    // Check stock again before processing payment
    const outOfStock = state.order.items.some(item => item.stock < item.quantity);
    if (outOfStock) {
        showError('payment', 'Some items in your cart are no longer available in the requested quantity. Please update your cart.');
        return;
    }
    
    // Disable pay button during processing
    elements.buttons.payButton.disabled = true;
    elements.buttons.payButton.textContent = 'Processing...';
    
    // Show confirmation panel
    elements.panels.payment.classList.add('hidden');
    elements.panels.confirmation.classList.remove('hidden');
    
    // Prepare payment data
    const paymentData = {
        email: state.order.customer.email,
        amount: state.order.total * 100, // Paystack expects amount in kobo
        currency: config.currency,
        ref: 'ORD-' + Date.now(),
        metadata: {
            custom_fields: [
                {
                    display_name: "Customer Name",
                    variable_name: "customer_name",
                    value: `${state.order.customer.firstName} ${state.order.customer.lastName}`
                },
                {
                    display_name: "Shipping Address",
                    variable_name: "shipping_address",
                    value: `${state.order.shippingInfo.address}, ${state.order.shippingInfo.city}, ${state.order.shippingInfo.state}`
                },
                {
                    display_name: "User ID",
                    variable_name: "user_id",
                    value: state.order.customer.uid
                }
            ]
        },
        callback: function(response) {
            // Payment successful
            paymentSuccess(response.reference);
        },
        onClose: function() {
            // Payment window closed
            paymentWindowClosed();
        }
    };
    
    // Initialize Paystack payment
    const handler = PaystackPop.setup({
        key: config.paystackPublicKey,
        ...paymentData
    });
    
    handler.openIframe();
}

// Handle successful payment
async function paymentSuccess(reference) {
    try {
        // Create order data
        const orderData = {
            userId: state.order.customer.uid,
            customer: {
                email: state.order.customer.email,
                firstName: state.order.customer.firstName,
                lastName: state.order.customer.lastName
            },
            items: state.order.items.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity
            })),
            subtotal: state.order.subtotal,
            shipping: state.order.shipping,
            total: state.order.total,
            shippingInfo: state.order.shippingInfo,
            paymentReference: reference,
            status: "completed",
            createdAt: serverTimestamp(),
            paidAt: serverTimestamp()
        };
        
        // Create a batch for atomic operations
        const batch = writeBatch(db);
        
        // 1. Create the order document
        const orderRef = doc(collection(db, "orders"));
        batch.set(orderRef, orderData);
        
        // 2. Clear the user's cart
        const cartRef = doc(db, "carts", state.order.customer.uid);
        batch.set(cartRef, { items: {} });
        
        // 3. Update product stock quantities
        for (const item of state.order.items) {
            const productRef = doc(db, "products", item.id);
            batch.update(productRef, {
                stock: increment(-item.quantity),
                lastUpdated: serverTimestamp()
            });
        }

        // Commit the batch transaction
        await batch.commit();
        
        // Show success message
        showOrderConfirmation(reference, orderRef.id);

    } catch (error) {
        console.error("Order processing error:", error);
        let errorMessage = "Payment succeeded but order processing failed.";
        
        if (error.code) {
            errorMessage += ` (${error.code}: ${error.message})`;
        }
        
        showOrderError(
            reference,
            errorMessage,
            true
        );
    }
}

 function showOrderConfirmation(reference, orderId) {
    elements.confirmationContent.innerHTML = `
        <h2 class="panel-title">Order Confirmed!</h2>
        <p>Thank you for your purchase!</p>
        <p>Order ID: <strong>${orderId}</strong></p>
        <p>Payment Reference: <strong>${reference}</strong></p>
        
        <div class="order-summary">
            <h3>Items Purchased:</h3>
            ${state.order.items.map(item => `
                <div class="order-item">
                    <div>${item.name} (${item.quantity} × ₦${item.price.toLocaleString()})</div>
                    <div>₦${(item.price * item.quantity).toLocaleString()}</div>
                </div>
            `).join('')}
            <div class="order-total">Total: ₦${state.order.total.toLocaleString()}</div>
        </div>
        
        <button onclick="window.location.href='store.html'" class="btn">Continue Shopping</button>
    `;
}
    
function showOrderError(reference, message, paymentSuccessful) {
    elements.confirmationContent.innerHTML = `
        <h2 class="panel-title">${paymentSuccessful ? 'Payment Successful' : 'Payment Failed'}</h2>
        <p>${message}</p>
        ${paymentSuccessful ? `
            <p>Reference: ${reference}</p>
            <p>Please contact support with this information.</p>
        ` : ''}
        <button onclick="window.location.href='store.html'" class="btn">Return to Store</button>
    `;
}

// Handle payment window closed
function paymentWindowClosed() {
    // Re-enable pay button
    elements.buttons.payButton.disabled = false;
    elements.buttons.payButton.textContent = 'Pay Now';
    
    // Go back to payment panel
    elements.panels.confirmation.classList.add('hidden');
    elements.panels.payment.classList.remove('hidden');
    
    showError('payment', 'Payment window was closed. Please try again.');
}

// Initialize the checkout when page loads
document.addEventListener('DOMContentLoaded', initCheckout);