document.addEventListener("DOMContentLoaded", function() {
        
        (function(){
            console.log("FUSION ENGINE: Initializing...");

            const safeGet = (key, def) => {
                try {
                    return localStorage.getItem(key) || def;
                } catch(e) {
                    return def;
                }
            };
            const safeSet = (key, val) => {
                try {
                    localStorage.setItem(key, val);
                } catch(e) {}
            };

            const FE = {
                waLink: "212600000000",
                rates: { "MAD":1, "USD": 0.10, "EUR": 0.093 },
                sym: { "MAD": "DH", "USD": "\u0024", "EUR": "\u20ac" },
                
                catalog: [
                    { id: "p1", cat: "Box", title: "Salmon Lovers Box", price: 120, img: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600", desc: "12 pieces of premium salmon nigiri and california rolls.", inStock: true },
                    { id: "p2", cat: "Box", title: "Dragon King Platter", price: 155, img: "https://images.unsplash.com/photo-1553621042-f6e147245754?w=600", desc: "Artisan tempura shrimp roll topped with grilled unagi.", inStock: true },
                    { id: "p3", cat: "Taco", title: "Spicy Tuna Nori Taco", price: 45, img: "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=600", desc: "Crunchy nori shell with spicy marinated tuna mash.", inStock: true },
                    { id: "p4", cat: "Taco", title: "Salmon Avocado Taco", price: 40, img: "https://images.unsplash.com/photo-1617196034183-421b4917c92d?w=600", desc: "Light salmon cubes with lime-infused avocado mash.", inStock: true },
                    { id: "p5", cat: "Appetizer", title: "Dynamite Shrimp", price: 85, img: "https://images.unsplash.com/photo-1559715745-e1b33a271c8f?w=600", desc: "Tempura battered shrimp in a spicy fire glaze.", inStock: true },
                    { id: "p6", cat: "Appetizer", title: "Classic Miso Soup", price: 30, img: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600", desc: "Traditional broth with silk tofu and spring onions.", inStock: true }
                ],
                
                gallery: [
                    "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?q=80&w=500",
                    "https://images.unsplash.com/photo-1611143669185-af224c5e3252?q=80&w=500",
                    "https://images.unsplash.com/photo-1562436260-8c9216eeb703?q=80&w=500",
                    "https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=500",
                    "https://images.unsplash.com/photo-1617196034651-361730097f4a?q=80&w=500",
                    "https://images.unsplash.com/photo-1583623025817-d180a2221d0a?q=80&w=500"
                ],

                promos: [
                    { code: "SUSHI10", val: 0.10, type: "percent" },
                    { code: "MAD50", val: 50, type: "fixed" }
                ],

                state: {
                    currency: safeGet("fe_curr", "MAD"),
                    cart: JSON.parse(safeGet("fe_cart", "[]")),
                    wish: JSON.parse(safeGet("fe_wish", "[]")),
                    user: JSON.parse(safeGet("fe_user", "null")),
                    revs: JSON.parse(safeGet("fe_revs", '{"p1": [], "p2": []}')),
                    discount: 0,
                    discountMsg: ""
                }
            };

            const $ = (id) => document.getElementById(id);
            const $$ = (s) => document.querySelectorAll(s);
            
            const fmt = (p) => {
                const r = FE.rates[FE.state.currency];
                const s = FE.sym[FE.state.currency];
                const c = (p * r).toFixed(2);
                return FE.state.currency === "MAD" ? c + " DH" : s + c;
            };

            const save = () => {
                safeSet("fe_cart", JSON.stringify(FE.state.cart));
                safeSet("fe_wish", JSON.stringify(FE.state.wish));
                safeSet("fe_curr", FE.state.currency);
                safeSet("fe_revs", JSON.stringify(FE.state.revs));
                safeSet("fe_user", JSON.stringify(FE.state.user));
            };

            function showToast(msg, type = "success") {
                const c = $("#feToastContainer");
                if (!c) return;
                
                const el = document.createElement("div");
                el.className = "fe-toast " + type;
                el.innerHTML = `<span class="fe-toast-msg">${msg}</span><i class="bi bi-x-lg fe-toast-close"></i>`;
                
                c.appendChild(el);
                
                const closeBtn = el.querySelector(".fe-toast-close");
                if(closeBtn) closeBtn.onclick = () => el.remove();
                
                setTimeout(() => { if(el.parentElement) el.remove(); }, 3000);
            }

            let currentQVId = null;

            function openModal(id) { 
                const el = $(id); 
                if(el) el.style.display = "flex"; 
            }
            function closeModal() { 
                $$(".fe-modal-backdrop").forEach(m => m.style.display = "none"); 
            }
            
            function openSidebar(id) {
                const s = $(id);
                const b = $("#feSideBackdrop");
                if(s && b) { 
                    s.classList.add("open");
                    b.style.display = "block";
                }
            }
            
            function closeAll() {
                $$(".fe-sidebar").forEach(s => s.classList.remove("open"));
                closeModal();
                const b = $("#feSideBackdrop");
                if(b) b.style.display = "none";
            }

            function openQuickView(pid) {
                const p = FE.catalog.find(x => x.id === pid);
                if (!p) return;
                currentQVId = pid;
                
                const img = $("#feQVImg");
                const title = $("#feQVTitle");
                const price = $("#feQVPrice");
                const desc = $("#feQVDesc");

                if(img) img.src = p.img;
                if(title) title.textContent = p.title;
                if(price) price.textContent = fmt(p.price);
                if(desc) desc.textContent = p.desc;
                
                const rList = $("#feQVReviews");
                if(rList) {
                    rList.innerHTML = "";
                    const reviews = FE.state.revs[pid] || [];
                    if(reviews.length === 0) rList.innerHTML = "<p class='small text-muted'>No reviews yet.</p>";
                    
                    reviews.forEach(r => {
                        rList.insertAdjacentHTML("beforeend", `<div class="mb-2 border-bottom pb-1"><strong>${r.u}</strong>: ${r.t}</div>`);
                    });
                }
                openModal("#modalQuickView");
            }

            function renderMenu() {
                const g = $("#feMenuGrid");
                if(!g) return;
                g.innerHTML = "";
                
                FE.catalog.forEach(p => {
                    const w = FE.state.wish.includes(p.id);
                    const st = !p.inStock ? "out-of-stock" : "";
                    
                    const html = `<div class="fe-card ${st}" data-id="${p.id}">
                                    <div class="card-media-box">
                                        <img src="${p.img}" alt="${p.title}"/>
                                        <button class="wish-overlay ${w ? "active" : ""}" data-id="${p.id}"><i class="bi bi-heart-fill"></i></button>
                                    </div>
                                    <div class="card-info-box">
                                        <h5 class="fw-bold mb-2">${p.title}</h5>
                                        <div class="star-display mb-2 text-warning">★★★★☆</div>
                                        <p class="small text-muted mb-2">${p.desc}</p>
                                        <div class="d-flex justify-content-between align-items-center mt-auto">
                                            <span class="card-price-tag">${fmt(p.price)}</span>
                                            <button class="btn btn-sm btn-dark rounded-pill add-cart" data-id="${p.id}" ${!p.inStock ? "disabled" : ""}>Add</button>
                                        </div>
                                    </div>
                                </div>`;
                    g.insertAdjacentHTML("beforeend", html);
                });
            }

            function renderGallery() {
                const g = $("#feGalleryGrid");
                if(!g) return;
                g.innerHTML = "";
                FE.gallery.forEach(src => {
                    g.insertAdjacentHTML("beforeend", `<div class="gallery-frame"><img src="${src}" alt="Gallery"/></div>`);
                });
            }

            function renderCart() {
                const l = $("#feCartList");
                if(!l) return;
                l.innerHTML = "";
                let total = 0;
                
                if (!FE.state.cart.length) {
                    l.innerHTML = `<div class="text-center py-5 opacity-40"><i class="bi bi-cart-x display-1"></i><p class="mt-2">Basket Empty</p></div>`;
                    const f = $("#feCartFooter");
                    const b = $("#cartBadge");
                    if(f) f.style.display = "none";
                    if(b) b.textContent = "0";
                    return;
                }
                
                FE.state.cart.forEach(i => {
                    const p = FE.catalog.find(x => x.id === i.id);
                    if (p) {
                        total += p.price * i.qty;
                        const html = `<div class="cart-row-item">
                                        <img src="${p.img}"/>
                                        <div>
                                            <h6>${p.title}</h6>
                                            <div>${fmt(p.price)}</div>
                                            <div class="qty-engine">
                                                <span class="qty-btn" data-id="${i.id}" data-op="-">-</span>
                                                <span>${i.qty}</span>
                                                <span class="qty-btn" data-id="${i.id}" data-op="+">+</span>
                                            </div>
                                        </div>
                                        <button class="btn del-cart" data-id="${i.id}"><i class="bi bi-trash"></i></button>
                                    </div>`;
                        l.insertAdjacentHTML("beforeend", html);
                    }
                });

                if (FE.state.discount.type === "percent") total *= (1 - FE.state.discount.val);
                else if (FE.state.discount.type === "fixed") total -= FE.state.discount.val;

                const tDisplay = $("#feFinalTotalDisplay");
                const f = $("#feCartFooter");
                const b = $("#cartBadge");
                
                if(tDisplay) tDisplay.textContent = fmt(total);
                if(f) f.style.display = "block";
                if(b) b.textContent = FE.state.cart.length;
                save();
            }

            function renderWish() {
                const l = $("#feWishList");
                if(!l) return;
                l.innerHTML = "";
                if (!FE.state.wish.length) {
                    l.innerHTML = "<div class='text-center py-5'>No items in wishlist.</div>";
                    return;
                }
                FE.state.wish.forEach(id => {
                    const p = FE.catalog.find(x => x.id === id);
                    if (p) {
                        const html = `<div class="cart-row-item">
                                        <img src="${p.img}"/>
                                        <div>
                                            <h6>${p.title}</h6>
                                        </div>
                                        <button class="btn btn-sm btn-outline-danger rounded-pill remove-wish" data-id="${id}">&times;</button>
                                    </div>`;
                        l.insertAdjacentHTML("beforeend", html);
                    }
                });
                save();
            }

            // EVENT DELEGATION & LISTENERS
            document.addEventListener("click", (e) => {
                const t = e.target;
                
                if (t.closest("#btnMobileMenu")) { 
                    const l = $("#feMainLinks");
                    if(l) l.classList.toggle("active"); 
                }
                
                if (t.classList.contains("close-sidebar-trig") || t.classList.contains("fe-modal-x") || t.id === "feSideBackdrop") closeAll();
                
                if (t.classList.contains("add-cart")) {
                    e.stopPropagation();
                    const btn = t.closest(".add-cart");
                    if(btn) {
                        const id = btn.dataset.id;
                        const exists = FE.state.cart.find(item => item.id === id);
                        exists ? exists.qty++ : FE.state.cart.push({ id: id, qty: 1 });
                        save(); renderCart();
                        showToast("Added to basket!");
                    }
                }

                const card = t.closest(".fe-card");
                if (card && !t.closest(".add-cart") && !t.closest(".wish-overlay")) {
                    openQuickView(card.dataset.id);
                }

                if (t.closest(".wish-overlay")) {
                    const btn = t.closest(".wish-overlay");
                    if(btn) {
                        const id = btn.dataset.id;
                        const idx = FE.state.wish.indexOf(id);
                        if (idx > -1) {
                            FE.state.wish.splice(idx, 1);
                            btn.classList.remove("active");
                        } else {
                            FE.state.wish.push(id);
                            btn.classList.add("active");
                        }
                        save(); renderWish(); renderMenu();
                    }
                }

                if (t.classList.contains("remove-wish")) {
                    const id = t.dataset.id;
                    FE.state.wish.splice(FE.state.wish.indexOf(id), 1);
                    save(); renderWish(); renderMenu();
                }

                if (t.classList.contains("qty-btn")) {
                    const id = t.dataset.id;
                    const i = FE.state.cart.find(x => x.id === id);
                    if (i) {
                        if (t.dataset.op === "+") i.qty++;
                        if (t.dataset.op === "-" && i.qty > 1) i.qty--;
                        if (i.qty <= 0) FE.state.cart.splice(FE.state.cart.indexOf(i), 1);
                        save(); renderCart();
                    }
                }
                if (t.classList.contains("del-cart") || t.closest(".del-cart")) {
                    const btn = t.closest(".del-cart");
                    if(btn) {
                        const id = btn.dataset.id;
                        FE.state.cart = FE.state.cart.filter(x => x.id !== id);
                        save(); renderCart();
                    }
                }

                if (t.id === "btnOpenSearch") {
                    const o = $("#searchOverlay");
                    if(o) o.style.display = "flex";
                }
                if (t.id === "closeSearch") {
                    const o = $("#searchOverlay");
                    if(o) o.style.display = "none";
                }
                
                if (t.classList.contains("search-suggestion-item")) {
                    openQuickView(t.dataset.pid);
                    const o = $("#searchOverlay");
                    if(o) o.style.display = "none";
                }

                if (t.id === "closePopup") {
                    const p = $("#marketingPopup");
                    if(p) p.style.display = "none";
                }
                if (t.id === "btnPopupAction") {
                    const p = $("#marketingPopup");
                    if(p) p.style.display = "none";
                    openSidebar("sideCartPanel");
                }
            });

            const currSelect = $("#feCurrSelect");
            if(currSelect) {
                currSelect.addEventListener("change", (e) => {
                    FE.state.currency = e.target.value;
                    save(); renderMenu(); renderCart();
                });
            }

            const btnApplyPromo = $("#btnApplyPromo");
            if(btnApplyPromo) {
                btnApplyPromo.addEventListener("click", () => {
                    const v = $("#fePromoIn").value.trim();
                    const p = FE.promos.find(x => x.code === v);
                    const s = $("#fePromoStatus");
                    if (p) {
                        FE.state.discount = p;
                        if(s) { s.textContent = "Promo applied!"; s.className = "small mt-1 fw-bold text-success"; }
                    } else {
                        FE.state.discount = 0;
                        if(s) { s.textContent = "Invalid code"; s.className = "small mt-1 fw-bold text-danger"; }
                    }
                    renderCart();
                });
            }

            const btnFinalCheckoutWA = $("#btnFinalCheckoutWA");
            if(btnFinalCheckoutWA) {
                btnFinalCheckoutWA.addEventListener("click", () => {
                    let msg = "Order:\n";
                    let sum = 0;
                    FE.state.cart.forEach(i => {
                        const p = FE.catalog.find(x => x.id === i.id);
                        if (p) {
                            msg += "- " + i.qty + "x " + p.title + " (" + fmt(p.price * i.qty) + ")\n";
                            sum += p.price * i.qty;
                        }
                    });
                    const tDisplay = $("#feFinalTotalDisplay");
                    msg += "\nTotal: " + (tDisplay ? tDisplay.textContent : "0");
                    window.open("https://wa.me/" + FE.waLink + "?text=" + encodeURIComponent(msg), "_blank");
                    closeModal();
                });
            }

            const btnTriggerContactWA = $("#btnTriggerContactWA");
            if(btnTriggerContactWA) {
                btnTriggerContactWA.addEventListener("click", () => {
                    window.open("https://wa.me/" + FE.waLink + "?text=Hello Event Sushi", "_blank");
                });
            }

            const btnOrderNow = $("#btnOrderNow");
            if(btnOrderNow) {
                btnOrderNow.addEventListener("click", () => openSidebar("sideCartPanel"));
            }
            
            const btnBookTable = $("#btnBookTable");
            if(btnBookTable) {
                btnBookTable.addEventListener("click", () => openModal("modalTableBooking"));
            }
            
            const feFloatCartBtn = $("#feFloatCartBtn");
            if(feFloatCartBtn) {
                feFloatCartBtn.addEventListener("click", () => openSidebar("sideCartPanel"));
            }
            
            const wishToggle = $("#wishToggle");
            if(wishToggle) {
                wishToggle.addEventListener("click", () => openSidebar("sideWishPanel"));
            }

            const btnModalAddCart = $("#btnModalAddCart");
            if(btnModalAddCart) {
                btnModalAddCart.addEventListener("click", () => {
                    if(currentQVId) {
                        const exists = FE.state.cart.find(i => i.id === currentQVId);
                        exists ? exists.qty++ : FE.state.cart.push({ id: currentQVId, qty: 1 });
                        save(); renderCart(); 
                        showToast("Added from Quick View"); 
                        closeModal();
                    }
                });
            }

            const btnPostReview = $("#btnPostReview");
            if(btnPostReview) {
                btnPostReview.addEventListener("click", () => {
                    const txtEl = $("#inUserComment");
                    if(txtEl) {
                        const txt = txtEl.value;
                        if (!txt.trim()) return showToast("Please write a comment", "error");
                        if (!FE.state.revs[currentQVId]) FE.state.revs[currentQVId] = [];
                        FE.state.revs[currentQVId].push({ u: "Guest", s: 5, t: txt });
                        save();
                        showToast("Review posted!");
                        txtEl.value = "";
                        openQuickView(currentQVId);
                    }
                });
            }

            const feSearchIn = $("#feSearchIn");
            if(feSearchIn) {
                feSearchIn.addEventListener("keyup", (e) => {
                    const val = e.target.value.toLowerCase();
                    const res = $("#searchResults");
                    if(!res) return;
                    res.innerHTML = "";
                    if (val.length < 2) return;
                    
                    const hits = FE.catalog.filter(p => p.title.toLowerCase().includes(val));
                    hits.forEach(p => {
                        res.insertAdjacentHTML("beforeend", `<div class="search-suggestion-item" data-pid='${p.id}'>${p.title} - ${fmt(p.price)}</div>`);
                    });
                });
            });

            const btnSubmitBooking = $("#btnSubmitBooking");
            if(btnSubmitBooking) {
                btnSubmitBooking.addEventListener("click", () => {
                    const n = $("#bookInName").value;
                    const ph = $("#bookInPhone").value;
                    const d = $("#bookInDate").value;
                    const tm = $("#bookInTime").value;
                    const g = $("#bookInGuests").value;
                    
                    if (!n || !ph || !d || !tm) return showToast("Please fill all fields", "error");
                    
                    const msg = "Hi, I'd like to reserve a table.\n\nName: " + n + "\nPhone: " + ph + "\nDate: " + d + "\nTime: " + tm + "\nGuests: " + g;
                    window.open("https://wa.me/" + FE.waLink + "?text=" + encodeURIComponent(msg), "_blank");
                    closeModal();
                });
            }

            function init() {
                renderMenu();
                renderGallery();
                renderCart();
                renderWish();
                if(currSelect) currSelect.value = FE.state.currency;
                
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if(entry.isIntersecting) entry.target.classList.add("active");
                    });
                }, { threshold: 0.1 });
                
                $$(".reveal").forEach(el => observer.observe(el));

                if (!localStorage.getItem("fe_popup_seen")) {
                    setTimeout(() => {
                        const p = $("#marketingPopup");
                        if(p) {
                            p.style.display = "flex";
                            safeSet("fe_popup_seen", "true");
                        }
                    }, 2000);
                }
            }

            init();

        })();
});
