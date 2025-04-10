import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
        import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
        import { getFirestore, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        // Initialize Firebase with your config
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

        // Load orders when page loads
        onAuthStateChanged(auth, (user) => {
            if (user) {
                loadOrderHistory(user.uid);
            } else {
                window.location.href = 'login.html';
            }
        });

        function getStatusClass(status) {
            if (!status) return 'status-processing';
            status = status.toLowerCase();
            if (status.includes('complete') || status.includes('delivered')) {
                return 'status-completed';
            } else if (status.includes('cancel') || status.includes('rejected')) {
                return 'status-cancelled';
            } else {
                return 'status-processing';
            }
        }

        function formatDate(date) {
            if (!date) return 'Date not available';
            if (!(date instanceof Date)) {
                try {
                    date = date.toDate();
                } catch (e) {
                    console.warn("Couldn't convert date:", e);
                    return 'Invalid date';
                }
            }
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        async function enhanceOrdersWithProductImages(orders) {
            console.log("Fetching product images by name...");
            
            // Get all unique product names from all orders
            const productNames = [];
            orders.forEach(order => {
                order.items.forEach(item => {
                    if (item.name && !productNames.includes(item.name)) {
                        productNames.push(item.name);
                    }
                });
            });

            console.log("Product names to lookup:", productNames);

            if (productNames.length === 0) {
                console.log("No product names found in order items");
                return;
            }

            try {
                // Fetch all products by name
                const productsQuery = query(
                    collection(db, "products"),
                    where("name", "in", productNames)
                );
                
                const productsSnapshot = await getDocs(productsQuery);
                console.log("Found matching products:", productsSnapshot.size);

                const productsMap = {};
                productsSnapshot.forEach(doc => {
                    const product = doc.data();
                    productsMap[product.name] = product.imageUrl;
                    console.log(`Mapped product: ${product.name} => ${product.imageUrl}`);
                });

                // Enhance order items with product images
                orders.forEach(order => {
                    order.items.forEach(item => {
                        if (item.name && productsMap[item.name]) {
                            console.log(`Adding image to ${item.name}: ${productsMap[item.name]}`);
                            item.image = productsMap[item.name];
                        } else {
                            console.log(`No image found for product: ${item.name}`);
                        }
                    });
                });
            } catch (error) {
                console.error("Error fetching product images:", error);
            }
        }

        async function loadOrderHistory(userId) {
            const ordersContainer = document.getElementById('orders-container');
            
            try {
                let q;
                let needsClientSideSorting = false;
                
                // First try the query with ordering
                try {
                    q = query(
                        collection(db, "orders"),
                        where("userId", "==", userId),
                        orderBy("createdAt", "desc")
                    );
                    // Test the query
                    await getDocs(q);
                } catch (error) {
                    if (error.code === 'failed-precondition') {
                        // Fallback to simpler query if index doesn't exist
                        console.warn("Using fallback query without ordering - create index for better performance");
                        needsClientSideSorting = true;
                        q = query(
                            collection(db, "orders"),
                            where("userId", "==", userId)
                        );
                    } else {
                        throw error;
                    }
                }
                
                const querySnapshot = await getDocs(q);
                
                if (querySnapshot.empty) {
                    showNoOrders(ordersContainer);
                    return;
                }

                // Process and display orders
                ordersContainer.innerHTML = '';
                
                // Convert to array
                let orders = [];
                querySnapshot.forEach(doc => {
                    const orderData = doc.data();
                    orders.push({
                        id: doc.id,
                        ...orderData,
                        // Ensure createdAt is a Date object
                        createdAt: orderData.createdAt?.toDate?.() || new Date()
                    });
                });
                
                // Client-side sorting if needed
                if (needsClientSideSorting) {
                    orders.sort((a, b) => b.createdAt - a.createdAt); // Newest first
                }
                
                // Enhance orders with product images
                await enhanceOrdersWithProductImages(orders);
                
                // Display orders
                orders.forEach(order => {
                    const orderCard = createOrderCard(order);
                    ordersContainer.appendChild(orderCard);
                });
                
            } catch (error) {
                console.error("Error loading orders:", error);
                showError(ordersContainer, error);
            }
        }

        function createOrderCard(order) {
            const orderDate = order.createdAt || new Date();
            const shortId = order.id.substring(0, 8);
            const status = order.status || 'Processing';
            const statusClass = getStatusClass(status);
            
            const orderCard = document.createElement('div');
            orderCard.className = 'order-card';
            
            orderCard.innerHTML = `
                <div class="order-header">
                    <div>
                        <div class="order-id">Order #${shortId.toUpperCase()}</div>
                        <div class="order-date">${formatDate(orderDate)}</div>
                    </div>
                    <div class="order-status ${statusClass}">
                        <i class="fas ${statusClass === 'status-completed' ? 'fa-check-circle' : 
                            statusClass === 'status-cancelled' ? 'fa-times-circle' : 'fa-sync-alt'}"></i>
                        ${status}
                    </div>
                </div>
                <div class="order-items">
                    ${order.items.map(item => `
                        <div class="order-item">
                            <div class="item-info">
                                <img src="${item.image || getDefaultImageSVG('No Image')}" 
                                     alt="${item.name}" 
                                     class="item-image"
                                     onerror="this.onerror=null;this.src='${getDefaultImageSVG('Image Error')}'">
                                <div class="item-details">
                                    <div class="item-name">${item.name}</div>
                                    ${item.variation ? `<div class="item-variation">${item.variation}</div>` : ''}
                                    <div class="item-price">₦${item.price?.toLocaleString?.() || '0'} each</div>
                                </div>
                            </div>
                            <div class="item-price">
                                <span class="item-quantity">${item.quantity || 1} ×</span> 
                                ₦${((item.price || 0) * (item.quantity || 1)).toLocaleString()}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="order-footer">
                    <div class="order-total">
                        Total: ₦${order.total?.toLocaleString?.() || '0'}
                    </div>
                    <div class="order-actions">
                        <button class="action-button secondary" onclick="viewOrderDetails('${order.id}')">
                            <i class="fas fa-info-circle"></i> Details
                        </button>
                        ${status.toLowerCase().includes('cancel') || status.toLowerCase().includes('complete') ? '' : `
                        <button class="action-button primary" onclick="trackOrder('${order.id}')">
                            <i class="fas fa-truck"></i> Track
                        </button>
                        `}
                    </div>
                </div>
            `;
            
            return orderCard;
        }

        function getDefaultImageSVG(text) {
            return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='70' height='70' viewBox='0 0 70 70'>
                <rect width='100%' height='100%' fill='%23f8f8f8'/>
                <text x='50%' y='50%' font-family='Poppins' font-size='10' fill='%23666' 
                      text-anchor='middle' dominant-baseline='middle'>${text}</text>
            </svg>`;
        }

        function showNoOrders(container) {
            container.innerHTML = `
                <div class="empty-container">
                    <i class="fas fa-box-open status-icon"></i>
                    <h3 class="status-title">No Orders Yet</h3>
                    <p class="status-message">You haven't placed any orders yet. Start shopping to see your order history here.</p>
                    <button class="try-again" onclick="window.location.href='store.html'">Browse Products</button>
                </div>
            `;
        }

        function showError(container, error) {
            let errorMessage = "We couldn't load your order history. Please try again later.";
            let showIndexLink = false;
            
            if (error.code === 'failed-precondition') {
                errorMessage = `
                    We need to create a special index to show your orders properly.
                    <br><br>
                    <small>
                        This is a one-time setup. The admin should create this index in Firebase.
                    </small>
                `;
                showIndexLink = true;
            }
            
            container.innerHTML = `
                <div class="error-container">
                    <i class="fas fa-exclamation-triangle status-icon"></i>
                    <h3 class="status-title">Error Loading Orders</h3>
                    <div class="status-message">${errorMessage}</div>
                    ${showIndexLink ? `
                    <a href="https://console.firebase.google.com/v1/r/project/sbc-project-d9f9d/firestore/indexes" 
                       target="_blank" 
                       class="action-button secondary" 
                       style="margin-top: 10px; text-decoration: none;">
                        <i class="fas fa-external-link-alt"></i> Create Required Index
                    </a>
                    ` : ''}
                    <button class="try-again" onclick="location.reload()" style="margin-top: 20px;">
                        <i class="fas fa-sync-alt"></i> Try Again
                    </button>
                </div>
            `;
        }

        // Placeholder functions for order actions
        function viewOrderDetails(orderId) {
            console.log(`Viewing details for order: ${orderId}`);
            // window.location.href = `order-details.html?id=${orderId}`;
            alert(`Order details would show for order: ${orderId}\n\nIn a real app, this would redirect to an order details page.`);
        }

        function trackOrder(orderId) {
            console.log(`Tracking order: ${orderId}`);
            // window.location.href = `track-order.html?id=${orderId}`;
            alert(`Order tracking would show for order: ${orderId}\n\nIn a real app, this would redirect to a tracking page.`);
        }

        // Make functions available globally
        window.viewOrderDetails = viewOrderDetails;
        window.trackOrder = trackOrder;