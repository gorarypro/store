// --- Configuration ---
// **IMPORTANT**: Paste your NEW deployment URL (the one set to "Anyone")
// This must be the URL for the Code.gs that uses JSONP for everything.
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyp10uQxfT9J4U_4fmrKYA29iyrxgDVMWR2Q5TlM-jCUwD1aiond0MKHt5zKW9vTf2w5w/exec'; // <-- PASTE YOUR NEW URL

// --- Global State ---
let cart = [];
let wishlist = [];
let allProducts = []; // To store all products for quick lookup

// --- DOM Elements ---
const menuSections = document.getElementById('menuSections');
const loadingContainer = document.getElementById('loadingContainer');
const errorContainer = document.getElementById('errorContainer');
const retryBtn = document.getElementById('retryBtn');
const filterContainer = document.getElementById('filterContainer');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// Cart DOM
const cartSidebar = document.getElementById('cartSidebar');
const closeCartBtn = document.getElementById('closeCart');
const cartBody = document.getElementById('cartBody');
const cartTotal = document.getElementById('cartTotal');
const cartFooter = document.getElementById('cartFooter');
const emptyCartMessage = document.getElementById('emptyCartMessage');
const cartIcon = document.getElementById('cartIcon');
const floatingCart = document.getElementById('floatingCart');
const cartCountNav = document.getElementById('cartCount');
const floatingCartCount = document.getElementById('floatingCartCount');
const checkoutBtn = document.getElementById('checkoutBtn');

// Wishlist DOM
const wishlistSidebar = document.getElementById('wishlistSidebar');
const closeWishlistBtn = document.getElementById('closeWishlist');
const wishlistBody = document.getElementById('wishlistBody');
const emptyWishlistMessage = document.getElementById('emptyWishlistMessage');
const wishlistIcon = document.getElementById('wishlistIcon');
const floatingWishlist = document.getElementById('floatingWishlist');
const wishlistCountNav = document.getElementById('wishlistCount');
const floatingWishlistCount = document.getElementById('floatingWishlistCount');

// Quick View Modal DOM
const quickViewModal = document.getElementById('quickViewModal');
const closeQuickViewBtn = document.getElementById('closeQuickView');
const quickViewTitle = document.getElementById('quickViewTitle');
const quickViewImage = document.getElementById('quickViewImage');
const quickViewPrice = document.getElementById('quickViewPrice');
const quickViewDescription = document.getElementById('quickViewDescription');
const quickViewAddToCartBtn = document.getElementById('quickViewAddToCartBtn');
const relatedProductsGrid = document.getElementById('relatedProductsGrid');

// Phone Modal DOM
const phoneModal = document.getElementById('phoneModal');
const cancelCheckout = document.getElementById('cancelCheckout');
const confirmCheckout = document.getElementById('confirmCheckout');
const noThanksBtn = document.getElementById('noThanksBtn');
const addInfoBtn = document.getElementById('addInfoBtn');
const additionalInfo = document.getElementById('additionalInfo');

// --- Global function to handle menu data response ---
window.handleMenuResponse = function(data) {
  try {
    if (data.error) {
      throw new Error(`Apps Script error: ${data.error}`);
    }
    
    // Store all products in a flat array for easy lookup
    allProducts = data.flatMap(category => category.posts);

    // 1. Generate the HTML from the clean data
    generateMenuHTML(data);
    
    // 2. Populate filter buttons from the data
    populateFilterButtons(data);

    // 3. Initialize core functionalities
    initializeFilters();
    initializeCart();
    initializeWishlist();
    initializeQuickView();
    
    // Show the menu
    loadingContainer.style.display = 'none';
    menuSections.style.display = 'block';

  } catch (error) {
    console.error('Error processing menu data:', error);
    showError(error.message);
  }
}

/**
 * Fetches the menu data using the JSONP (script tag) method.
 */
function fetchMenuData() {
  loadingContainer.style.display = 'flex';
  errorContainer.style.display = 'none';
  menuSections.style.display = 'none';

  const oldScript = document.getElementById('jsonp-menu-script');
  if (oldScript) oldScript.remove();

  const script = document.createElement('script');
  script.id = 'jsonp-menu-script';
  script.src = `${WEB_APP_URL}?action=getMenu&callback=handleMenuResponse&v=${new Date().getTime()}`;
  
  script.onerror = function() {
    showError(`A network error occurred. Please check: \n1. Your internet connection. \n2. That the Apps Script URL is correct. \n3. That the script is deployed for "Anyone".`);
  };
  
  document.body.appendChild(script);
}

function showError(message) {
  errorContainer.querySelector('.error-message').textContent = message;
  loadingContainer.style.display = 'none';
  errorContainer.style.display = 'block';
}

function populateFilterButtons(categories) {
    filterContainer.innerHTML = '<button class="filter-btn active" data-filter="all">All</button>';
    categories.forEach(category => {
        if (category.posts.length > 0) {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.setAttribute('data-filter', category.title);
            btn.textContent = category.title;
            btn.style.borderColor = `var(--${category.color}-filter)`;
            btn.style.color = `var(--${category.color}-filter)`;
            filterContainer.appendChild(btn);
        }
    });
}

/**
 * Generates the menu HTML from the processed JSON data.
 */
function generateMenuHTML(categories) {
  let sectionsHTML = '';
  categories.forEach(category => {
    if (category.posts.length > 0) {
      sectionsHTML += `
        <div class="category-section" id="${category.title.toLowerCase()}-section">
          <div class="category-header ${category.color}">
            <div class="category-icon">${category.icon}</div>
            <h3 class="category-title">${category.title}</h3>
          </div>
          <p class="category-description">${category.description}</p>
          <div class="menu-grid">
            ${category.posts.map(post => `
              <div class="menu-item" data-id="${post.id}" data-category="${post.category}">
                <div class="menu-card">
                  <div class="card-img-container">
                    <img src="${post.imageUrl}" alt="${post.title}" onerror="this.src='https://placehold.co/600x400/fe7301/white?text=Image+Error'">
                    
                    <div class="product-card-overlay">
                      <button class="icon-btn quick-view-btn" data-id="${post.id}" aria-label="Quick View">
                        <i class="bi bi-eye"></i>
                      </button>
                      <button class="icon-btn wishlist-btn" data-id="${post.id}" aria-label="Add to Wishlist">
                        <i class="bi bi-heart"></i>
                      </button>
                    </div>

                    ${post.price > 0 ? `<span class="price-badge">${post.price} ${post.currency}</span>` : ''}
                    ${post.isSpecialOffer ? '<span class="special-offer">Special</span>' : ''}
                  </div>
                  <div class="card-body">
                    <h5 class="card-title">${post.title}</h5>
                    <p class="card-text">${post.shortDescription}</p>
                  </div>
                  <div class="card-footer">
                    <div class="price-tag">${post.price} ${post.currency}</div>
                    <button class="order-btn add-to-cart-btn" data-id="${post.id}">
                      <i class="bi bi-cart-plus"></i>
                      Add to Cart
                    </button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  });
  menuSections.innerHTML = sectionsHTML;
}

retryBtn.addEventListener('click', fetchMenuData);

function initializeFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const categorySections = document.querySelectorAll('.category-section');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      filterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const filter = this.getAttribute('data-filter');
      
      categorySections.forEach(section => {
        if (filter === 'all') {
          section.style.display = 'block';
        } else {
          if (section.id === `${filter.toLowerCase()}-section`) {
            section.style.display = 'block';
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            section.style.display = 'none';
          }
        }
      });

      // --- Apply active filter button styles ---
      filterBtns.forEach(b => {
          b.style.backgroundColor = '';
          b.style.color = '';
          const originalColor = b.getAttribute('data-filter') ? `var(--${b.getAttribute('data-filter').toLowerCase()}-filter)` : `var(--primary)`;
          if (b.getAttribute('data-filter') !== 'all') {
              b.style.color = originalColor;
          } else {
              b.style.color = `var(--primary)`;
          }
      });
      if (filter !== 'all') {
          this.style.backgroundColor = `var(--${filter.toLowerCase()}-filter)`;
          this.style.color = 'white';
      } else {
          this.style.backgroundColor = `var(--primary)`;
          this.style.color = 'white';
      }
    });
  });
}

// --- Helper function to find a product by its ID ---
function getProductById(id) {
  return allProducts.find(p => p.id === id);
}

// --- Show/Hide Sidebar Overlay ---
function openSidebar(sidebar) {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
}

function closeSidebar(sidebar) {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
}

// --- Show Notification Toast ---
function showNotification(message, type = 'success') {
  const toastEl = document.getElementById('notificationToast');
  const toastBody = toastEl.querySelector('.toast-body');
  
  // Set message and icon
  if (type === 'success') {
      toastBody.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i> ${message}`;
      toastEl.className = 'toast align-items-center text-white bg-success border-0';
  } else if (type === 'danger') {
      toastBody.innerHTML = `<i class="bi bi-heartbreak-fill me-2"></i> ${message}`;
      toastEl.className = 'toast align-items-center text-white bg-danger border-0';
  } else {
      toastBody.innerHTML = `<i class="bi bi-info-circle-fill me-2"></i> ${message}`;
      toastEl.className = 'toast align-items-center text-white bg-secondary border-0';
  }
  
  const toast = new bootstrap.Toast(toastEl, { autohide: true, delay: 2000 });
  toast.show();
}

/**
 * =================================================================
 * CART LOGIC
 * =================================================================
 */
function initializeCart() {
  cart = JSON.parse(localStorage.getItem('eventSushiCart')) || [];
  updateCartUI();

  // Event Listeners
  cartIcon.addEventListener('click', () => openSidebar(cartSidebar));
  floatingCart.addEventListener('click', () => openSidebar(cartSidebar));
  closeCartBtn.addEventListener('click', () => closeSidebar(cartSidebar));
  sidebarOverlay.addEventListener('click', () => {
      closeSidebar(cartSidebar);
      closeSidebar(wishlistSidebar);
  });

  // Add to Cart (Event Delegation for all buttons)
  document.body.addEventListener('click', e => {
    const btn = e.target.closest('.add-to-cart-btn');
    if (btn) {
      const id = btn.getAttribute('data-id');
      addItemToCart(id);
      showNotification('Added to cart!');
    }
  });

  // Handle clicks inside cart body
  cartBody.addEventListener('click', e => {
    const decreaseBtn = e.target.closest('.decrease-qty');
    const increaseBtn = e.target.closest('.increase-qty');
    if (decreaseBtn) {
      updateQuantity(decreaseBtn.getAttribute('data-id'), -1);
    }
    if (increaseBtn) {
      updateQuantity(increaseBtn.getAttribute('data-id'), 1);
    }
  });

  checkoutBtn.addEventListener('click', () => {
    if (cart.length === 0) return;
    closeSidebar(cartSidebar);
    phoneModal.classList.add('show');
  });

  // Phone modal listeners
  noThanksBtn.addEventListener('click', () => additionalInfo.style.display = 'none');
  addInfoBtn.addEventListener('click', () => additionalInfo.style.display = 'block');
  cancelCheckout.addEventListener('click', closePhoneModal);
  confirmCheckout.addEventListener('click', handleCheckout);
}

function addItemToCart(id) {
  const product = getProductById(id);
  if (!product) return;

  const existingItemIndex = cart.findIndex(item => item.id === id);
  if (existingItemIndex !== -1) {
    cart[existingItemIndex].quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }
  updateCartUI();
}

function updateQuantity(id, change) {
  const itemIndex = cart.findIndex(item => item.id === id);
  if (itemIndex !== -1) {
    cart[itemIndex].quantity += change;
    if (cart[itemIndex].quantity <= 0) {
      cart.splice(itemIndex, 1);
    }
    updateCartUI();
  }
}

function updateCartUI() {
  const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
  cartCountNav.textContent = totalItems;
  floatingCartCount.textContent = totalItems;
  
  const totalPrice = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  cartTotal.textContent = `${totalPrice.toFixed(2)} ${cart.length > 0 ? cart[0].currency : 'DH'}`;
  
  if (cart.length === 0) {
    cartBody.innerHTML = ''; // Clear items
    emptyCartMessage.style.display = 'block';
    cartFooter.style.display = 'none';
  } else {
    emptyCartMessage.style.display = 'none';
    cartFooter.style.display = 'block';
    let cartHTML = '';
    cart.forEach(item => {
      cartHTML += `
        <div class='sidebar-item' data-id='${item.id}'>
          <img src='${item.imageUrl}' alt='${item.title}'>
          <div class='sidebar-item-info'>
            <div class='sidebar-item-title'>${item.title}</div>
            <div class='sidebar-item-price'>${item.price} ${item.currency}</div>
          </div>
          <div class='sidebar-item-actions'>
            <button class='quantity-btn decrease-qty' data-id='${item.id}'>-</button>
            <span>${item.quantity}</span>
            <button class='quantity-btn increase-qty' data-id='${item.id}'>+</button>
          </div>
        </div>
      `;
    });
    cartBody.innerHTML = cartHTML;
  }
  localStorage.setItem('eventSushiCart', JSON.stringify(cart));
}

function closePhoneModal() {
  phoneModal.classList.remove('show');
  additionalInfo.style.display = 'none';
  document.getElementById('customerPhone').value = '';
  document.getElementById('customerName').value = '';
  document.getElementById('customerEmail').value = '';
  document.getElementById('customerAddress').value = '';
}

let isProcessingCheckout = false;

function handleCheckout() {
  if (isProcessingCheckout) return;

  const phone = document.getElementById('customerPhone').value;
  if (!phone) {
    alert('Please enter your phone number');
    return;
  }
  
  isProcessingCheckout = true;
  document.getElementById('checkoutButtonText').style.display = 'none';
  document.getElementById('checkoutLoading').style.display = 'inline-block';
  
  const totalPrice = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  const orderDetails = cart.map(item => `${item.quantity}x ${item.title}`).join(', ');
  const currency = cart.length > 0 ? cart[0].currency : 'DH';
  
  const orderData = {
    phone: phone,
    name: document.getElementById('customerName').value || 'Not provided',
    email: document.getElementById('customerEmail').value || 'Not provided',
    address: document.getElementById('customerAddress').value || 'Not provided',
    orderDetails: orderDetails,
    totalAmount: `${totalPrice.toFixed(2)} ${currency}`
  };

  const callbackName = 'handleOrderResponse' + new Date().getTime();

  window[callbackName] = function(response) {
    if (response.status === 'success') {
      handleOrderSuccess(orderData);
    } else {
      console.error('Checkout error:', response.message);
      alert('There was an error placing your order. Please try again.');
      resetCheckoutButton();
    }
    delete window[callbackName];
    const script = document.getElementById('jsonp-order-script');
    if (script) script.remove();
  };

  const oldScript = document.getElementById('jsonp-order-script');
  if (oldScript) oldScript.remove();

  let params = `action=saveOrder&callback=${callbackName}`;
  for (const key in orderData) {
    params += `&${encodeURIComponent(key)}=${encodeURIComponent(orderData[key])}`;
  }

  const script = document.createElement('script');
  script.id = 'jsonp-order-script';
  script.src = `${WEB_APP_URL}?${params}`;
  
  script.onerror = function() {
    alert('There was a problem proceeding your order. Please check your internet connection and try again.');
    resetCheckoutButton();
    delete window[callbackName];
    script.remove();
  };
  
  document.body.appendChild(script);
}

function resetCheckoutButton() {
  document.getElementById('checkoutButtonText').style.display = 'inline';
  document.getElementById('checkoutLoading').style.display = 'none';
  isProcessingCheckout = false;
}

function handleOrderSuccess(orderData) {
  showNotification('Order placed! Redirecting to WhatsApp...', 'success');
  
  let message = `Hello! I'd like to place an order for the following items:\n\n${orderData.orderDetails}\n\nTotal: ${orderData.totalAmount}\n\n`;
  message += `My details:\nPhone: ${orderData.phone}`;
  if (orderData.name !== 'Not provided') message += `\nName: ${orderData.name}`;
  if (orderData.email !== 'Not provided') message += `\nEmail: ${orderData.email}`;
  if (orderData.address !== 'Not provided') message += `\nAddress: ${orderData.address}`;
  message += `\n\nPlease confirm my order. Thank you!`;
  
  setTimeout(() => {
    const phoneNumber = "212600000000"; // Your WhatsApp number
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    
    cart = [];
    localStorage.removeItem('eventSushiCart');
    updateCartUI();
    closePhoneModal();
    resetCheckoutButton();
  }, 2000);
}

/**
 * =================================================================
 * WISHLIST LOGIC
 * =================================================================
 */
function initializeWishlist() {
  wishlist = JSON.parse(localStorage.getItem('eventSushiWishlist')) || [];
  updateWishlistUI();

  // Event Listeners
  wishlistIcon.addEventListener('click', () => openSidebar(wishlistSidebar));
  floatingWishlist.addEventListener('click', () => openSidebar(wishlistSidebar));
  closeWishlistBtn.addEventListener('click', () => closeSidebar(wishlistSidebar));

  // Add/Remove from Wishlist (Event Delegation)
  document.body.addEventListener('click', e => {
    const btn = e.target.closest('.wishlist-btn');
    if (btn) {
      const id = btn.getAttribute('data-id');
      toggleWishlistItem(id);
    }
  });

  // Handle clicks inside wishlist body
  wishlistBody.addEventListener('click', e => {
    const removeBtn = e.target.closest('.remove-from-wishlist-btn');
    const addBtn = e.target.closest('.add-to-cart-from-wishlist-btn');
    
    if (removeBtn) {
      const id = removeBtn.getAttribute('data-id');
      toggleWishlistItem(id, 'remove');
      showNotification('Removed from wishlist', 'danger');
    }
    
    if (addBtn) {
      const id = addBtn.getAttribute('data-id');
      addItemToCart(id);
      showNotification('Added to cart!', 'success');
      // Optionally remove from wishlist after adding to cart
      // toggleWishlistItem(id, 'remove'); 
    }
  });
}

function toggleWishlistItem(id, forceAction = null) {
  const product = getProductById(id);
  if (!product) return;

  const itemIndex = wishlist.findIndex(item => item.id === id);
  
  if (forceAction === 'remove' || itemIndex !== -1) {
    wishlist.splice(itemIndex, 1);
    if (forceAction !== 'remove') showNotification('Removed from wishlist', 'danger');
  } else if (forceAction === 'add' || itemIndex === -1) {
    wishlist.push(product);
    showNotification('Added to wishlist!', 'info');
  }
  
  updateWishlistUI();
}

function updateWishlistUI() {
  const totalItems = wishlist.length;
  wishlistCountNav.textContent = totalItems;
  floatingWishlistCount.textContent = totalItems;

  // Update heart icons on all product cards
  document.querySelectorAll('.wishlist-btn').forEach(btn => {
    const id = btn.getAttribute('data-id');
    if (wishlist.some(item => item.id === id)) {
      btn.classList.add('active');
      btn.querySelector('i').classList.replace('bi-heart', 'bi-heart-fill');
    } else {
      btn.classList.remove('active');
      btn.querySelector('i').classList.replace('bi-heart-fill', 'bi-heart');
    }
  });

  // Update wishlist sidebar
  if (wishlist.length === 0) {
    wishlistBody.innerHTML = ''; // Clear items
    emptyWishlistMessage.style.display = 'block';
  } else {
    emptyWishlistMessage.style.display = 'none';
    let wishlistHTML = '';
    wishlist.forEach(item => {
      wishlistHTML += `
        <div class='sidebar-item' data-id='${item.id}'>
          <img src='${item.imageUrl}' alt='${item.title}'>
          <div class='sidebar-item-info'>
            <div class='sidebar-item-title'>${item.title}</div>
            <div class='sidebar-item-price'>${item.price} ${item.currency}</div>
          </div>
          <div class='sidebar-item-actions'>
            <button class='add-to-cart-from-wishlist-btn add-to-cart-btn' data-id='${item.id}' aria-label="Add to Cart">
              <i class="bi bi-cart-plus"></i>
            </button>
            <button class='remove-from-wishlist-btn' data-id='${item.id}' aria-label="Remove from Wishlist">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
    });
    wishlistBody.innerHTML = wishlistHTML;
  }
  
  localStorage.setItem('eventSushiWishlist', JSON.stringify(wishlist));
}

/**
 * =================================================================
 * QUICK VIEW LOGIC
 * =================================================================
 */
function initializeQuickView() {
  // Event Delegation for Quick View buttons
  menuSections.addEventListener('click', e => {
    const btn = e.target.closest('.quick-view-btn');
    if (btn) {
      const id = btn.getAttribute('data-id');
      openQuickView(id);
    }
  });

  closeQuickViewBtn.addEventListener('click', () => quickViewModal.classList.remove('show'));
  
  // Add to cart from quick view
  quickViewAddToCartBtn.addEventListener('click', function() {
    const id = this.getAttribute('data-id');
    addItemToCart(id);
    showNotification('Added to cart!', 'success');
    quickViewModal.classList.remove('show');
  });
}

function openQuickView(id) {
  const product = getProductById(id);
  if (!product) return;

  // 1. Populate Modal Content
  quickViewTitle.textContent = product.title;
  quickViewImage.src = product.imageUrl;
  quickViewPrice.textContent = `${product.price} ${product.currency}`;
  quickViewDescription.textContent = product.fullDescription; // Use fullDescription
  quickViewAddToCartBtn.setAttribute('data-id', product.id);

  // 2. Generate Related Products
  const relatedProducts = allProducts.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
  
  if (relatedProducts.length > 0) {
    relatedProductsGrid.innerHTML = relatedProducts.map(item => `
      <div class="related-item">
        <img src="${item.imageUrl}" alt="${item.title}" onerror="this.src='https://placehold.co/100x80/fe7301/white?text=No+Image'">
        <div class="related-item-title">${item.title}</div>
      </div>
    `).join('');
    relatedProductsGrid.parentElement.style.display = 'block';
  } else {
    relatedProductsGrid.parentElement.style.display = 'none';
  }

  // 3. Show Modal
  quickViewModal.classList.add('show');
}

// --- Initial Call to Start the App ---
fetchMenuData();
