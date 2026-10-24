import { useCallback, useEffect, useMemo, useState } from "react";
import {
	BrowserRouter,
	Link,
	NavLink,
	Route,
	Routes,
	useNavigate,
	useParams,
} from "react-router-dom";
import {
	ArrowLeft,
	ArrowUpLeft,
	Check,
	ChefHat,
	ChevronDown,
	ChevronLeft,
	Clock3,
	Flame,
	Heart,
	Menu as MenuIcon,
	Minus,
	Plus,
	Search,
	ShieldCheck,
	ShoppingBag,
	ShoppingCart,
	Trash2,
	Truck,
	X,
} from "lucide-react";
import { api, formatPrice, getErrorMessage, getImageUrl } from "./api";

const currentYear = new Date().getFullYear();
const categoriesFallback = ["الكل", "سوشي", "حواوشي", "وجبات", "العروض"];
const imagePlaceholder = "/food-placeholder.svg";

function ProductImage({ imageUrl, ...props }) {
	const source = getImageUrl(imageUrl);
	const [failedSource, setFailedSource] = useState(null);

	return (
		<img
			{...props}
			src={failedSource === source ? imagePlaceholder : source}
			onError={() => setFailedSource(source)}
		/>
	);
}

function useCart() {
	const [items, setItems] = useState(() => {
		try {
			return JSON.parse(localStorage.getItem("kadry-cart") || "[]");
		} catch {
			return [];
		}
	});

	useEffect(() => localStorage.setItem("kadry-cart", JSON.stringify(items)), [items]);

	const add = (product, quantity = 1, note = "") => {
		setItems((current) => {
			const found = current.find((item) => item.productId === product.id && item.note === note);
			if (found) {
				return current.map((item) =>
					item === found ? { ...item, quantity: item.quantity + quantity } : item,
				);
			}
			return [
				...current,
				{
					productId: product.id,
					name: product.name,
					price: product.currentPrice ?? product.price,
					imageUrl: product.imageUrl,
					quantity,
					note,
					available: true,
				},
			];
		});
	};

	const refreshProducts = useCallback(async () => {
		const ids = [...new Set(items.map((item) => item.productId))];
		const results = await Promise.allSettled(ids.map((id) => api.get(`/products/${id}`)));
		const unavailable = [];
		const latestProducts = new Map();
		results.forEach((result, index) => {
			if (result.status === "fulfilled") latestProducts.set(ids[index], result.value.data);
			else if (result.reason?.response?.status === 404) unavailable.push(ids[index]);
			else throw result.reason;
		});
		setItems((current) => {
			let changed = false;
			const next = current.map((item) => {
			const product = latestProducts.get(item.productId);
			const updated = product
				? { ...item, name: product.name, price: product.currentPrice ?? product.price, imageUrl: product.imageUrl, available: true }
				: { ...item, available: false };
			const itemChanged = item.name !== updated.name || item.price !== updated.price || item.imageUrl !== updated.imageUrl || item.available !== updated.available;
			if (itemChanged) changed = true;
			return itemChanged ? updated : item;
			});
			return changed ? next : current;
		});
		return unavailable;
	}, [items]);

	const changeQuantity = (productId, quantity, note = "") => {
		setItems((current) =>
			quantity < 1
				? current.filter((item) => !(item.productId === productId && item.note === note))
				: current.map((item) =>
						item.productId === productId && item.note === note ? { ...item, quantity } : item,
					),
		);
	};

	return {
		items,
		add,
		changeQuantity,
		refreshProducts,
		remove: (productId, note) =>
			setItems((current) =>
				current.filter((item) => !(item.productId === productId && item.note === note)),
			),
		clear: () => setItems([]),
		count: items.reduce((total, item) => total + item.quantity, 0),
		subtotal: items.reduce((total, item) => total + item.price * item.quantity, 0),
	};
}

function ProductCard({ product, onAdd }) {
	return (
		<article className="product-card">
			<Link to={`/menu/${product.id}`} className="product-photo-wrap">
				<ProductImage imageUrl={product.imageUrl} alt={product.name} className="product-photo" />
				{product.discountPercent > 0 && (
					<span className="discount-badge">خصم {product.discountPercent}%</span>
				)}
				<button
					className="favorite-button"
					type="button"
					aria-label={`عرض ${product.name}`}
					onClick={(event) => {
						event.preventDefault();
						onAdd(product);
					}}
				>
					<Plus size={18} />
				</button>
			</Link>
			<div className="product-info">
				<div className="product-meta"><span>{product.categoryName}</span></div>
				<Link to={`/menu/${product.id}`} className="product-name">{product.name}</Link>
				<p className="product-description">{product.description}</p>
				<div className="product-bottom">
					<div className="price-wrap">
						<strong>{formatPrice(product.currentPrice ?? product.price)}</strong>
						{product.discountPercent > 0 && <del>{formatPrice(product.price)}</del>}
					</div>
					<button className="add-button" onClick={() => onAdd(product)} aria-label={`أضف ${product.name} للسلة`}>
						<Plus size={18} />
					</button>
				</div>
			</div>
		</article>
	);
}

function ProductsSection({ title, eyebrow, products, loading, error, onAdd, actionLabel, actionTo = "/menu" }) {
	return (
		<section className="section content-section">
			<div className="section-heading">
				<div>
					<span className="eyebrow">{eyebrow}</span>
					<h2>{title}</h2>
				</div>
				<Link className="text-link" to={actionTo}>{actionLabel || "اكتشف القائمة"} <ArrowLeft size={17} /></Link>
			</div>
			{loading ? <div className="loading-state"><span className="loader" /> بنجهزلك أحلى حاجة...</div> :
				error ? <div className="notice error-notice">{error}</div> :
					products.length ? <div className="product-grid">{products.map((product) => (
						<ProductCard key={product.id} product={product} onAdd={onAdd} />
					))}</div> : <div className="empty-state">القائمة بتتجهز حاليًا، ارجع لنا قريبًا.</div>}
		</section>
	);
}

function Header({ cartCount }) {
	const [mobileOpen, setMobileOpen] = useState(false);
	return (
		<header className="site-header" dir="rtl">
			<div className="header-inner">
				<Link to="/" className="brand" aria-label="كادري الرئيسية">
					<span className="brand-mark"><ChefHat size={21} /></span>
					<span className="brand-name">كادري<span>سوشي & حواوشي</span></span>
				</Link>
				<button className="mobile-menu-button" onClick={() => setMobileOpen(!mobileOpen)} aria-label="القائمة">
					{mobileOpen ? <X /> : <MenuIcon />}
				</button>
				<nav className={`main-nav ${mobileOpen ? "nav-open" : ""}`}>
					<NavLink to="/" onClick={() => setMobileOpen(false)}>الرئيسية</NavLink>
					<NavLink to="/menu" onClick={() => setMobileOpen(false)}>المنيو</NavLink>
					<a href="/#story" onClick={() => setMobileOpen(false)}>حكايتنا</a>
					<a href="/#contact" onClick={() => setMobileOpen(false)}>تواصل معنا</a>
				</nav>
				<div className="header-actions">
					<a className="header-phone" href="/#contact"><span className="phone-dot" /> تواصل معنا</a>
					<Link to="/cart" className="cart-button" aria-label={`السلة ${cartCount}`}>
						<ShoppingBag size={19} /><span>السلة</span><b>{cartCount}</b>
					</Link>
				</div>
			</div>
		</header>
	);
}

function Footer() {
	return (
		<footer className="site-footer" id="contact" dir="rtl">
			<div className="footer-main content-width">
				<div className="footer-brand">
					<Link to="/" className="brand"><span className="brand-mark"><ChefHat size={21} /></span><span className="brand-name">كادري<span>سوشي & حواوشي</span></span></Link>
					<p>لقمة تجمع بين حكايتين.. نكهات يابانية أصيلة وحواوشي مصري على أصوله.</p>
				</div>
				<div><h4>روابط سريعة</h4><Link to="/menu">المنيو</Link><Link to="/cart">سلة الطلبات</Link><a href="/#story">عن كادري</a></div>
				<div><h4>خدمة العملاء</h4><a href="/#contact">بيانات التواصل تُضاف قبل الإطلاق</a><span>مواعيد العمل يحددها المطعم</span><span>عنوان المطعم يضاف هنا</span></div>
				<div><h4>تابعنا</h4><div className="social-links"><a href="https://instagram.com" aria-label="Instagram">ig</a><a href="https://facebook.com" aria-label="Facebook">f</a><a href="https://tiktok.com" aria-label="TikTok">♪</a></div></div>
			</div>
			<div className="footer-bottom content-width"><span>© {currentYear} كادري. كل الحقوق محفوظة.</span><span>صُنع بحب في مصر <Heart size={14} fill="currentColor" /></span></div>
		</footer>
	);
}

function HomePage({ onAdd }) {
	const [products, setProducts] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		api.get("/products?featured=true").then(({ data }) => setProducts(data))
			.catch((reason) => setError(getErrorMessage(reason)))
			.finally(() => setLoading(false));
	}, []);

	return (
		<>
			<section className="hero" dir="rtl">
				<div className="hero-photo" />
				<div className="hero-shade" />
				<div className="hero-content content-width">
					<div className="hero-copy">
						<div className="hero-pill"><span /> طعم مختلف.. حكاية واحدة</div>
						<h1>على مزاجك،<br /><em>على أصوله.</em></h1>
						<p>سوشي معمول بحب، وحواوشي بطعم البيت. اختار حكايتك والطلب علينا.</p>
						<div className="hero-actions"><Link to="/menu" className="button button-primary">اطلب دلوقتي <ArrowUpLeft size={18} /></Link><a href="#story" className="hero-secondary">اكتشف حكايتنا <ChevronLeft size={16} /></a></div>
						<div className="hero-proof"><span className="hero-proof-icon"><ChefHat size={16} /></span><div><b>مكونات طازة كل يوم</b><small>وشغل معمول بحب من أول لقمة</small></div></div>
					</div>
					<div className="hero-caption"><span>طازة كل يوم</span><span className="caption-line" /><span>Made with love</span></div>
				</div>
				<div className="hero-scroll"><span>اكتشف كادري</span><ChevronDown size={15} /></div>
			</section>

			<div className="trust-strip" dir="rtl">
				<div><span className="trust-icon"><Truck size={20} /></span><span><b>توصيل لحد عندك</b><small>سريع وآمن لباب البيت</small></span></div>
				<div><span className="trust-icon"><ChefHat size={20} /></span><span><b>طازة على الطلب</b><small>مكونات يومية مختارة</small></span></div>
				<div><span className="trust-icon"><ShieldCheck size={20} /></span><span><b>جودة مضمونة</b><small>رضاك أهم حاجة عندنا</small></span></div>
				<div><span className="trust-icon"><Clock3 size={20} /></span><span><b>دايمًا في معادنا</b><small>وجبتك توصلك سخنة</small></span></div>
			</div>

			<ProductsSection title="اختيارات كادري" eyebrow="الأكثر طلبًا" products={products} loading={loading} error={error} onAdd={onAdd} />

			<section className="category-section content-width" dir="rtl">
				<div className="section-heading"><div><span className="eyebrow">منيو على مزاجك</span><h2>حكايتين.. في مكان واحد</h2></div><Link className="text-link" to="/menu">شوف المنيو كامل <ArrowLeft size={17} /></Link></div>
				<div className="category-cards">
					<Link className="category-card sushi-category" to="/menu?category=سوشي"><img src="https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=85" alt="سوشي طازج" /><div className="category-overlay" /><div className="category-copy"><span>فن ياباني.. بلمسة كادري</span><h3>عالم السوشي</h3><span className="circle-arrow"><ArrowLeft size={18} /></span></div></Link>
					<Link className="category-card hawawshi-category" to="/menu?category=حواوشي"><img src="https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=1200&q=85" alt="حواوشي مصري" /><div className="category-overlay" /><div className="category-copy"><span>ريحة البيت.. وطعم الأصالة</span><h3>حواوشي على أصوله</h3><span className="circle-arrow"><ArrowLeft size={18} /></span></div></Link>
				</div>
			</section>

			<section className="story-section" id="story" dir="rtl">
				<div className="story-image"><img src="https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=1100&q=85" alt="تحضير وجبة كادري" /><div className="story-stamp"><span>طازة</span><span>كل يوم</span></div></div>
				<div className="story-copy"><span className="eyebrow">حكاية كادري</span><h2>من قلب مصر،<br /><em>لعالم من النكهات.</em></h2><p>بدأت حكايتنا من حبنا للأكل اللي بيجمع الناس. خدنا شغفنا بالتفاصيل اليابانية، وحطيناه جنب أصالة المطبخ المصري.. والنتيجة؟ طعم ملوش شبه.</p><Link to="/menu" className="button button-dark">اعرف حكايتنا <ArrowLeft size={17} /></Link><div className="story-signature">الطعم اللي يخلّيك ترجع تاني <span>كادري</span></div></div>
			</section>

			<section className="offer-banner content-width" dir="rtl">
				<div><span className="eyebrow">خليها علينا</span><h2>أول مرة تطلب؟<br /><em>الفرحة مضاعفة.</em></h2><p>اطلب من المنيو واكتشف عروضنا المميزة كل يوم.</p><Link to="/menu?category=العروض" className="button button-primary">اكتشف العروض <ArrowLeft size={17} /></Link></div>
				<div className="offer-art"><span className="offer-circle"><Flame size={35} /><b>طعم<br />يفرق</b></span><span className="offer-scribble">made<br />fresh</span></div>
			</section>
		</>
	);
}

function MenuPage({ onAdd }) {
	const [products, setProducts] = useState([]);
	const [categories, setCategories] = useState([]);
	const [selected, setSelected] = useState(new URLSearchParams(window.location.search).get("category") || "الكل");
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		Promise.all([api.get("/products"), api.get("/categories")])
			.then(([productsResponse, categoriesResponse]) => {
				setProducts(productsResponse.data);
				setCategories(categoriesResponse.data.map((category) => category.name));
			})
			.catch((reason) => setError(getErrorMessage(reason)))
			.finally(() => setLoading(false));
	}, []);

	const categoryNames = ["الكل", ...new Set([...categories, ...categoriesFallback.slice(1)])];
	const shown = useMemo(() => products.filter((product) => {
		const matchesCategory = selected === "الكل" || product.categoryName === selected || (selected === "العروض" && product.discountPercent > 0);
		return matchesCategory && `${product.name} ${product.description}`.toLowerCase().includes(search.toLowerCase());
	}), [products, selected, search]);

	return (
		<main className="menu-page" dir="rtl">
			<section className="menu-hero content-width"><div className="eyebrow">المنيو</div><h1>كل لقمة، <em>لها حكاية.</em></h1><p>اختار اللي على مزاجك.. والباقي علينا.</p><div className="breadcrumb"><Link to="/">الرئيسية</Link><ChevronLeft size={14} /><span>المنيو</span></div></section>
			<div className="menu-controls content-width">
				<div className="category-tabs">{categoryNames.map((category) => <button key={category} className={selected === category ? "category-tab active" : "category-tab"} onClick={() => setSelected(category)}>{category}</button>)}</div>
				<label className="search-input"><Search size={18} /><input placeholder="بتدور على إيه؟" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
			</div>
			<section className="content-section content-width menu-results">
				<div className="results-heading"><div><span className="eyebrow">{selected === "الكل" ? "كل اللي بتحبه" : selected}</span><h2>{selected === "الكل" ? "منيو كادري" : selected}</h2></div><span>{shown.length} أصناف</span></div>
				{loading ? <div className="loading-state"><span className="loader" /> بنجهزلك أحلى حاجة...</div> : error ? <div className="notice error-notice">{error}</div> : shown.length ? <div className="product-grid">{shown.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} />)}</div> : <div className="empty-state"><Search size={25} /><b>مش لاقيين اللي بتدور عليه</b><span>جرب كلمة تانية أو اختار تصنيف مختلف.</span></div>}
			</section>
		</main>
	);
}

function ProductPage({ onAdd }) {
	const { id } = useParams();
	const navigate = useNavigate();
	const [product, setProduct] = useState(null);
	const [quantity, setQuantity] = useState(1);
	const [note, setNote] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		api.get(`/products/${id}`).then(({ data }) => setProduct(data)).catch((reason) => setError(getErrorMessage(reason)));
	}, [id]);

	if (error) return <main className="simple-page" dir="rtl"><div className="notice error-notice">{error}</div><Link to="/menu" className="text-link">العودة للمنيو</Link></main>;
	if (!product) return <main className="simple-page" dir="rtl"><div className="loading-state"><span className="loader" /> بنحضر التفاصيل...</div></main>;

	const addAndGo = () => { onAdd(product, quantity, note); navigate("/cart"); };
	return <main className="product-detail content-width" dir="rtl">
		<div className="breadcrumb"><Link to="/">الرئيسية</Link><ChevronLeft size={14} /><Link to="/menu">المنيو</Link><ChevronLeft size={14} /><span>{product.name}</span></div>
		<div className="detail-layout"><div className="detail-image"><ProductImage imageUrl={product.imageUrl} alt={product.name} /></div><div className="detail-copy"><span className="eyebrow">{product.categoryName}</span><h1>{product.name}</h1><p>{product.description}</p><div className="detail-price">{formatPrice(product.currentPrice ?? product.price)} {product.discountPercent > 0 && <del>{formatPrice(product.price)}</del>}</div><label className="note-field">ملاحظات للطلب <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثال: من غير بصل..." maxLength={300} /></label><div className="detail-buy"><div className="quantity-control"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="تقليل الكمية"><Minus size={16} /></button><b>{quantity}</b><button onClick={() => setQuantity(quantity + 1)} aria-label="زيادة الكمية"><Plus size={16} /></button></div><button className="button button-primary" onClick={addAndGo}>أضف للسلة · {formatPrice((product.currentPrice ?? product.price) * quantity)} <ShoppingCart size={17} /></button></div></div></div>
	</main>;
}

function CartPage({ cart }) {
	const navigate = useNavigate();
	const [deliveryFee, setDeliveryFee] = useState(null);
	const [unavailable, setUnavailable] = useState([]);
	const [cartError, setCartError] = useState("");
	const [settingsError, setSettingsError] = useState("");
	const [validatedFingerprint, setValidatedFingerprint] = useState("");
	const cartFingerprint = cart.items.map((item) => `${item.productId}:${item.quantity}:${item.note}`).join("|");
	const refreshing = validatedFingerprint !== cartFingerprint;
	useEffect(() => {
		api.get("/store/settings").then(({ data }) => setDeliveryFee(data.deliveryFee)).catch((reason) => setSettingsError(getErrorMessage(reason)));
	}, []);
	useEffect(() => {
		let active = true;
		cart.refreshProducts().then((missing) => { if (active) setUnavailable(missing); })
			.catch((reason) => { if (active) setCartError(getErrorMessage(reason)); })
			.finally(() => { if (active) setValidatedFingerprint(cartFingerprint); });
		return () => { active = false; };
	}, [cart, cartFingerprint]);
	const total = deliveryFee === null ? null : cart.subtotal + deliveryFee;
	return <main className="simple-page content-width" dir="rtl">
		<div className="page-title"><span className="eyebrow">طلبك</span><h1>سلة المشتريات</h1><p>كل حاجة اخترتها.. في مكانها.</p></div>
		{cart.items.length === 0 ? <div className="empty-cart"><span className="empty-cart-icon"><ShoppingBag size={32} /></span><h2>السلة لسه فاضية</h2><p>اختار أكلك المفضل وسيب الباقي علينا.</p><Link className="button button-primary" to="/menu">روح للمنيو <ArrowLeft size={17} /></Link></div> :
			<div className="cart-layout"><div className="cart-items">{cartError && <div className="notice error-notice">{cartError}</div>}{unavailable.length > 0 && <div className="notice error-notice">في السلة منتجات لم تعد متاحة. احذفها للمتابعة.</div>}{cart.items.map((item) => <article className={`cart-item ${item.available === false ? "unavailable-item" : ""}`} key={`${item.productId}-${item.note}`}><ProductImage imageUrl={item.imageUrl} alt="" /><div className="cart-item-copy"><Link to={`/menu/${item.productId}`}>{item.name}</Link>{item.note && <small>ملاحظة: {item.note}</small>}{item.available === false ? <small className="field-error">غير متاح حاليًا</small> : <b>{formatPrice(item.price)}</b>}</div><div className="quantity-control"><button onClick={() => cart.changeQuantity(item.productId, item.quantity - 1, item.note)} aria-label="تقليل الكمية"><Minus size={15} /></button><b>{item.quantity}</b><button onClick={() => cart.changeQuantity(item.productId, item.quantity + 1, item.note)} aria-label="زيادة الكمية"><Plus size={15} /></button></div><button className="icon-button danger-icon" onClick={() => cart.remove(item.productId, item.note)} aria-label="حذف"><Trash2 size={17} /></button></article>)}<Link className="text-link continue-shopping" to="/menu"><ArrowRightIcon /> كمل تسوق</Link></div>
				<aside className="order-summary"><h3>ملخص الطلب</h3><div><span>المجموع الفرعي</span><b>{formatPrice(cart.subtotal)}</b></div><div><span>التوصيل</span><span>{deliveryFee === null ? "..." : formatPrice(deliveryFee)}</span></div><hr /><div className="summary-total"><span>الإجمالي</span><b>{total === null ? "..." : formatPrice(total)}</b></div>{settingsError && <div className="notice error-notice">{settingsError}</div>}<button className="button button-primary checkout-button" disabled={refreshing || unavailable.length > 0 || deliveryFee === null || Boolean(cartError || settingsError)} onClick={() => navigate("/checkout")}>{refreshing ? "جاري تحديث الأسعار..." : <>كمّل بياناتك <ArrowLeft size={17} /></>}</button><p><ShieldCheck size={15} /> بياناتك محمية وآمنة</p></aside></div>}
	</main>;
}

function ArrowRightIcon() { return <ArrowLeft size={17} className="flip-icon" />; }

function CheckoutPage({ cart }) {
	const navigate = useNavigate();
	const [deliveryFee, setDeliveryFee] = useState(null);
	const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
	const [form, setForm] = useState({ customerName: "", phone: "", address: "", notes: "", paymentMethod: "CashOnDelivery" });
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [fieldErrors, setFieldErrors] = useState({});
	const [unavailableItems, setUnavailableItems] = useState([]);
	const [cartError, setCartError] = useState("");
	const [settingsError, setSettingsError] = useState("");
	const [validatedFingerprint, setValidatedFingerprint] = useState("");
	const cartFingerprint = cart.items.map((item) => `${item.productId}:${item.quantity}:${item.note}`).join("|");
	const refreshingCart = validatedFingerprint !== cartFingerprint;
	const phonePattern = /^(?:\+?20|0)?1[0125]\d{8}$/;
	useEffect(() => {
		api.get("/store/settings").then(({ data }) => setDeliveryFee(data.deliveryFee)).catch((reason) => setSettingsError(getErrorMessage(reason)));
	}, []);
	useEffect(() => {
		let active = true;
		cart.refreshProducts().then((missing) => { if (active) setUnavailableItems(missing); })
			.catch((reason) => { if (active) setCartError(getErrorMessage(reason)); })
			.finally(() => { if (active) setValidatedFingerprint(cartFingerprint); });
		return () => { active = false; };
	}, [cart, cartFingerprint]);

	const submit = async (event) => {
		event.preventDefault();
		const errors = {};
		if (!form.customerName.trim()) errors.customerName = "اكتب اسمك من فضلك.";
		if (!phonePattern.test(form.phone.replace(/[\s-]/g, ""))) errors.phone = "اكتب رقم موبايل مصري صحيح.";
		if (!form.address.trim()) errors.address = "اكتب عنوان التوصيل.";
		setFieldErrors(errors);
		if (Object.keys(errors).length || busy || !cart.items.length || refreshingCart || unavailableItems.length || deliveryFee === null || cartError || settingsError) return;
		setBusy(true);
		setError("");
		try {
			const { data } = await api.post("/orders", {
				...form,
				phone: form.phone.replace(/[\s-]/g, ""),
				items: cart.items.map(({ productId, quantity, note }) => ({ productId, quantity, note })),
			}, { headers: { "Idempotency-Key": submissionKey } });
			if (form.paymentMethod === "Visa") {
				const payment = await api.post(`/payments/${data.orderNumber}/checkout`);
				if (!payment.data.checkoutUrl) throw new Error("لم يتم إنشاء رابط الدفع. لم يتم تحصيل أي مبلغ.");
				window.location.assign(payment.data.checkoutUrl);
				return;
			}
			cart.clear();
			navigate(`/order-confirmation/${data.orderNumber}`, { state: { total: data.total } });
		} catch (reason) {
			setError(getErrorMessage(reason));
			setBusy(false);
		}
	};

	if (!cart.items.length) return <main className="simple-page content-width" dir="rtl"><div className="empty-cart"><h2>مفيش طلب نكمله</h2><Link className="button button-primary" to="/menu">روح للمنيو</Link></div></main>;
	return <main className="simple-page content-width" dir="rtl"><div className="page-title"><span className="eyebrow">خطوة أخيرة</span><h1>تأكيد الطلب</h1><p>بياناتك هتساعدنا نوصل طلبك لحد عندك.</p></div><form className="checkout-layout" onSubmit={submit} noValidate><div className="checkout-fields">
		<section className="form-card"><h2><span>١</span> بيانات التوصيل</h2><div className="field-grid"><label className="form-field">الاسم بالكامل<input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="اسمك إيه؟" autoComplete="name" />{fieldErrors.customerName && <small className="field-error">{fieldErrors.customerName}</small>}</label><label className="form-field">رقم الموبايل<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01xxxxxxxxx" inputMode="tel" autoComplete="tel" />{fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}</label><label className="form-field full-field">عنوان التوصيل<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="المنطقة، الشارع، رقم العمارة والشقة" autoComplete="street-address" />{fieldErrors.address && <small className="field-error">{fieldErrors.address}</small>}</label><label className="form-field full-field">ملاحظات إضافية <span className="optional">(اختياري)</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="علامة مميزة أو تعليمات التوصيل..." /></label></div></section>
		<section className="form-card"><h2><span>٢</span> طريقة الدفع</h2><label className={`payment-option ${form.paymentMethod === "CashOnDelivery" ? "selected" : ""}`}><input type="radio" name="payment" value="CashOnDelivery" checked={form.paymentMethod === "CashOnDelivery"} onChange={(e) => { setForm({ ...form, paymentMethod: e.target.value }); setSubmissionKey(crypto.randomUUID()); }} /><span className="payment-symbol">ج</span><span><b>كاش عند الاستلام</b><small>ادفع كاش لما طلبك يوصل</small></span><Check size={18} /></label><label className={`payment-option ${form.paymentMethod === "Visa" ? "selected" : ""}`}><input type="radio" name="payment" value="Visa" checked={form.paymentMethod === "Visa"} onChange={(e) => { setForm({ ...form, paymentMethod: e.target.value }); setSubmissionKey(crypto.randomUUID()); }} /><span className="payment-symbol visa-symbol">VISA</span><span><b>بطاقة بنكية</b><small>دفع آمن عبر بوابة Paymob</small></span><Check size={18} /></label></section>
	</div><aside className="order-summary checkout-summary"><h3>طلبك</h3><div className="checkout-order-list">{cart.items.map((item) => <div key={`${item.productId}-${item.note}`}><span>{item.quantity} × {item.name}{item.available === false && " · غير متاح"}</span><b>{formatPrice(item.price * item.quantity)}</b></div>)}</div><hr /><div><span>المجموع الفرعي</span><b>{formatPrice(cart.subtotal)}</b></div><div><span>التوصيل</span><span>{deliveryFee === null ? "..." : formatPrice(deliveryFee)}</span></div><hr /><div className="summary-total"><span>الإجمالي</span><b>{deliveryFee === null ? "..." : formatPrice(cart.subtotal + deliveryFee)}</b></div>{settingsError && <div className="notice error-notice">{settingsError}</div>}{cartError && <div className="notice error-notice">{cartError}</div>}{unavailableItems.length > 0 && <div className="notice error-notice">احذف المنتجات غير المتاحة من السلة قبل التأكيد.</div>}{error && <div className="notice error-notice">{error}</div>}<button className="button button-primary checkout-button" disabled={busy || deliveryFee === null || refreshingCart || unavailableItems.length > 0 || Boolean(cartError || settingsError)}>{busy ? <><span className="button-loader" /> جاري تأكيد طلبك...</> : <>أكّد الطلب <ArrowLeft size={17} /></>}</button><p><ShieldCheck size={15} /> لا نقوم بتخزين بيانات بطاقتك</p></aside></form></main>;
}

function ConfirmationPage() {
	const { orderNumber } = useParams();
	const [tracking, setTracking] = useState({ state: "loading", order: null });
	useEffect(() => {
		let active = true;
		let timer;
		const checkStatus = async (attempt = 0) => {
			try {
				const { data } = await api.get(`/orders/track/${encodeURIComponent(orderNumber)}`);
				if (!active) return;
				setTracking({ state: "ready", order: data });
				if (data.paymentMethod === "Visa" && data.paymentStatus === "Pending" && attempt < 5)
					timer = setTimeout(() => checkStatus(attempt + 1), 3000);
			} catch (reason) {
				if (active) setTracking({ state: "error", order: null, message: getErrorMessage(reason) });
			}
		};
		void checkStatus();
		return () => { active = false; clearTimeout(timer); };
	}, [orderNumber]);
	const statusText = { New: "طلبك وصلنا، وهنبدأ نجهزه قريب.", Confirmed: "تم تأكيد طلبك.", Preparing: "طلبك بيتحضر بحب.", ReadyForDelivery: "طلبك جاهز وفي طريقه ليك.", Delivered: "تم توصيل طلبك.", Cancelled: "تم إلغاء الطلب." };
	const order = tracking.order;
	const message = tracking.state === "loading" ? "بنتأكد من تفاصيل طلبك..." :
		tracking.state === "error" ? `تعذر التحقق من حالة الطلب. احتفظ برقم الطلب وتواصل مع المطعم. ${tracking.message}` :
			order?.paymentMethod === "Visa" && order.paymentStatus === "Pending" ? "الطلب مسجل، والدفع لم يتأكد بعد. ننتظر إشعار Paymob الموثوق." :
				order?.paymentMethod === "Visa" && order.paymentStatus !== "Paid" ? "لم يتم تأكيد الدفع. لم نعتبر الطلب مدفوعًا؛ يمكنك المحاولة مرة أخرى أو التواصل مع المطعم." :
					statusText[order?.status] || "تم تسجيل الطلب.";
	return <main className="confirmation-page content-width" dir="rtl"><div className="confirmation-card"><span className="success-icon"><Check size={33} /></span><span className="eyebrow">شكرًا لاختيارك كادري</span><h1>{tracking.state === "error" ? "تعذر تأكيد الحالة" : order?.paymentMethod === "Visa" && order.paymentStatus !== "Paid" && tracking.state === "ready" ? "بانتظار تأكيد الدفع" : "طلبك وصلنا"}</h1><p>{message}</p><div className="order-number">رقم طلبك <b>{orderNumber}</b></div><Link className="button button-dark" to="/menu">ارجع للمنيو <ArrowLeft size={17} /></Link></div></main>;
}

function AdminLogin({ onLogin }) {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const submit = async (event) => {
		event.preventDefault();
		setBusy(true);
		setError("");
		try {
			const { data } = await api.post("/admin/auth/login", { username, password });
			sessionStorage.setItem("kadry-admin-token", data.token);
			onLogin(data);
		} catch (reason) { setError(getErrorMessage(reason)); }
		finally { setBusy(false); }
	};
	return <main className="admin-login" dir="rtl"><Link to="/" className="brand"><span className="brand-mark"><ChefHat size={21} /></span><span className="brand-name">كادري<span>لوحة الإدارة</span></span></Link><form className="admin-login-card" onSubmit={submit}><span className="admin-lock"><ShieldCheck size={24} /></span><span className="eyebrow">مساحة خاصة</span><h1>أهلًا بيك</h1><p>سجّل دخولك لإدارة مطعمك.</p><label className="form-field">اسم المستخدم<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label><label className="form-field">كلمة المرور<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>{error && <div className="notice error-notice">{error}</div>}<button className="button button-primary checkout-button" disabled={busy}>{busy ? "جاري الدخول..." : "تسجيل الدخول"} <ArrowLeft size={17} /></button></form><Link className="admin-back-link" to="/">العودة للموقع</Link></main>;
}

const orderStatuses = [
	["New", "جديد"], ["Confirmed", "تم التأكيد"], ["Preparing", "قيد التحضير"],
	["ReadyForDelivery", "جاهز للتوصيل"], ["Delivered", "تم التوصيل"], ["Cancelled", "ملغي"],
];

async function fetchAdminDashboardData() {
	const [productsResult, ordersResult, statsResult, categoriesResult] = await Promise.all([
		api.get("/admin/products"), api.get("/admin/orders"), api.get("/admin/dashboard"), api.get("/admin/categories"),
	]);
	return {
		products: productsResult.data,
		orders: ordersResult.data,
		stats: statsResult.data,
		categories: categoriesResult.data,
	};
}

function AdminDashboard({ onLogout }) {
	const [tab, setTab] = useState("overview");
	const [products, setProducts] = useState([]);
	const [orders, setOrders] = useState([]);
	const [stats, setStats] = useState(null);
	const [categories, setCategories] = useState([]);
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [editor, setEditor] = useState(null);
	const [selectedOrder, setSelectedOrder] = useState(null);
	const [imageFile, setImageFile] = useState(null);
	const [preview, setPreview] = useState("");

	const load = useCallback(async (showLoading = true) => {
		if (showLoading) setBusy(true);
		try {
			const data = await fetchAdminDashboardData();
			setProducts(data.products);
			setOrders(data.orders);
			setStats(data.stats);
			setCategories(data.categories);
		} catch (reason) { setNotice(getErrorMessage(reason)); }
		finally { if (showLoading) setBusy(false); }
	}, []);
	useEffect(() => {
		let active = true;
		fetchAdminDashboardData().then((data) => {
			if (!active) return;
			setProducts(data.products);
			setOrders(data.orders);
			setStats(data.stats);
			setCategories(data.categories);
		})
			.catch((reason) => { if (active) setNotice(getErrorMessage(reason)); });
		return () => { active = false; };
	}, []);
	useEffect(() => {
		return () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); };
	}, [preview]);

	const selectImage = (file) => {
		setImageFile(file);
		setPreview(file ? URL.createObjectURL(file) : editor?.imageUrl || "");
	};

	const newProduct = () => {
		setImageFile(null);
		setPreview("");
		setEditor({ id: null, name: "", description: "", price: "", categoryId: categories.find((category) => category.active)?.id || "", available: true, featured: false, discountPercent: 0, imageUrl: "" });
	};
	const editProduct = (product) => {
		setImageFile(null);
		setPreview(product.imageUrl || "");
		setEditor({ ...product, discountPercent: product.discountPercent || 0 });
	};
	const saveProduct = async (event) => {
		event.preventDefault();
		setBusy(true);
		try {
			let imageUrl = editor.imageUrl;
			if (imageFile) {
				const body = new FormData();
				body.append("file", imageFile);
				const uploaded = await api.post("/admin/uploads/images", body);
				imageUrl = uploaded.data.imageUrl;
			}
			const payload = {
				name: editor.name, description: editor.description, price: Number(editor.price),
				categoryId: Number(editor.categoryId), available: editor.available, featured: editor.featured,
				discountPercent: Number(editor.discountPercent || 0), imageUrl,
			};
			if (editor.id) await api.put(`/admin/products/${editor.id}`, payload);
			else await api.post("/admin/products", payload);
			setEditor(null);
			setNotice("تم حفظ المنتج بنجاح.");
			await load();
		} catch (reason) { setNotice(getErrorMessage(reason)); }
		finally { setBusy(false); }
	};
	const deleteProduct = async (product) => {
		if (!window.confirm(`متأكد إنك عايز تحذف "${product.name}"؟`)) return;
		try { await api.delete(`/admin/products/${product.id}`); setNotice("تم حذف المنتج."); await load(); }
		catch (reason) { setNotice(getErrorMessage(reason)); }
	};
	const updateOrder = async (order, status) => {
		try { await api.patch(`/admin/orders/${order.id}/status`, { status }); setNotice("تم تحديث حالة الطلب."); await load(); }
		catch (reason) { setNotice(getErrorMessage(reason)); }
	};
	const openOrder = async (order) => {
		try {
			const { data } = await api.get(`/admin/orders/${order.id}`);
			setSelectedOrder(data);
		} catch (reason) { setNotice(getErrorMessage(reason)); }
	};
	const addCategory = async () => {
		const name = window.prompt("اسم التصنيف الجديد:");
		if (!name?.trim()) return;
		try {
			await api.post("/admin/categories", { name: name.trim() });
			setNotice("تمت إضافة التصنيف.");
			await load();
		} catch (reason) { setNotice(getErrorMessage(reason)); }
	};
	const renameCategory = async (category) => {
		const name = window.prompt("اسم التصنيف:", category.name);
		if (!name?.trim() || name.trim() === category.name) return;
		try {
			await api.put(`/admin/categories/${category.id}`, { name: name.trim() });
			setNotice("تم تحديث التصنيف.");
			await load();
		} catch (reason) { setNotice(getErrorMessage(reason)); }
	};
	const toggleCategory = async (category) => {
		try {
			await api.patch(`/admin/categories/${category.id}/active?active=${!category.active}`);
			setNotice(category.active ? "تم إخفاء التصنيف." : "تم تفعيل التصنيف.");
			await load();
		} catch (reason) { setNotice(getErrorMessage(reason)); }
	};
	const filteredProducts = products.filter((product) => `${product.name} ${product.categoryName}`.toLowerCase().includes(search.toLowerCase()));
	const filteredOrders = orders.filter((order) => {
		const orderDate = order.createdAt.slice(0, 10);
		return `${order.orderNumber} ${order.customerName} ${order.phone}`.toLowerCase().includes(search.toLowerCase())
			&& (!statusFilter || order.status === statusFilter)
			&& (!dateFrom || orderDate >= dateFrom)
			&& (!dateTo || orderDate <= dateTo);
	});

	return <main className="admin-app" dir="rtl"><aside className="admin-sidebar"><Link to="/" className="brand"><span className="brand-mark"><ChefHat size={21} /></span><span className="brand-name">كادري<span>إدارة المطعم</span></span></Link><div className="admin-profile"><span>ك</span><div><b>مدير المطعم</b><small>مسؤول النظام</small></div></div><nav className="admin-nav">{[["overview", "نظرة عامة"], ["products", "المنتجات"], ["orders", "الطلبات"]].map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); setSearch(""); }}><span className="admin-nav-dot" />{label}{key === "orders" && <small>{orders.filter((order) => order.status === "New").length}</small>}</button>)}</nav><div className="admin-sidebar-bottom"><Link to="/">عرض الموقع <ArrowUpLeft size={15} /></Link><button onClick={onLogout}>تسجيل الخروج <ArrowLeft size={15} /></button></div></aside>
		<section className="admin-main"><header className="admin-topbar"><div><span className="eyebrow">إدارة مطعمك</span><h1>{tab === "overview" ? "نظرة عامة" : tab === "products" ? "إدارة المنتجات" : "إدارة الطلبات"}</h1></div><button className="admin-refresh" onClick={load} aria-label="تحديث"><span className={busy ? "spin" : ""}>↻</span></button></header>
			{notice && <div className="admin-notice"><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}
			{tab === "overview" && <>{stats && <div className="stats-grid"><div className="stat-card"><span>إجمالي الطلبات</span><b>{stats.totalOrders}</b><small>كل الطلبات المسجلة</small><span className="stat-icon"><ShoppingBag size={18} /></span></div><div className="stat-card"><span>طلبات جديدة</span><b>{stats.newOrders}</b><small>بانتظار التأكيد</small><span className="stat-icon orange"><Clock3 size={18} /></span></div><div className="stat-card"><span>إجمالي المنتجات</span><b>{stats.totalProducts}</b><small>منتج في المنيو</small><span className="stat-icon"><ChefHat size={18} /></span></div><div className="stat-card"><span>مبيعات مؤكدة</span><b>{formatPrice(stats.verifiedSales)}</b><small>الطلبات المدفوعة أو المسلّمة</small><span className="stat-icon orange"><Flame size={18} /></span></div></div>}
				<div className="admin-panel"><div className="panel-heading"><div><h2>أحدث الطلبات</h2><span>تابع حركة الطلبات أولًا بأول</span></div><button className="small-link" onClick={() => setTab("orders")}>كل الطلبات <ArrowLeft size={15} /></button></div><OrdersTable orders={orders.slice(0, 5)} updateOrder={updateOrder} onSelect={openOrder} />{!orders.length && !busy && <div className="admin-empty">مفيش طلبات لسه.</div>}</div>
				<div className="admin-panel"><div className="panel-heading"><div><h2>منتجات المنيو</h2><span>إدارة الأطباق والأسعار والتوفر</span></div><button className="small-link" onClick={() => setTab("products")}>إدارة المنتجات <ArrowLeft size={15} /></button></div><ProductsTable products={products.slice(0, 4)} onEdit={editProduct} onDelete={deleteProduct} /></div></>}
			{tab === "products" && <><div className="admin-panel"><div className="panel-heading"><div><h2>كل المنتجات <span className="item-count">{products.length}</span></h2><span>أضف وعدّل منتجاتك من هنا</span></div><button className="button button-primary admin-add-button" onClick={newProduct}><Plus size={17} /> إضافة منتج</button></div><div className="admin-toolbar"><label className="search-input"><Search size={17} /><input placeholder="دور على منتج..." value={search} onChange={(e) => setSearch(e.target.value)} /></label><span>{filteredProducts.length} منتج</span></div><ProductsTable products={filteredProducts} onEdit={editProduct} onDelete={deleteProduct} /></div><div className="admin-panel"><div className="panel-heading"><div><h2>تصنيفات المنيو</h2><span>أضف تصنيفًا أو أخفه مؤقتًا</span></div><button className="small-link" onClick={addCategory}><Plus size={15} /> إضافة تصنيف</button></div><div className="category-manager">{categories.map((category) => <div className="category-manager-item" key={category.id}><span className={`status-pill ${category.active ? "status-active" : "status-off"}`}><i />{category.active ? "ظاهر" : "مخفي"}</span><b>{category.name}</b><div><button onClick={() => renameCategory(category)}>تعديل الاسم</button><button onClick={() => toggleCategory(category)}>{category.active ? "إخفاء" : "تفعيل"}</button></div></div>)}</div></div></>}
			{tab === "orders" && <div className="admin-panel"><div className="panel-heading"><div><h2>كل الطلبات <span className="item-count">{orders.length}</span></h2><span>اضغط على رقم الطلب لعرض تفاصيل العميل</span></div></div><div className="admin-toolbar order-filters"><label className="search-input"><Search size={17} /><input placeholder="رقم الطلب أو اسم العميل..." value={search} onChange={(e) => setSearch(e.target.value)} /></label><select aria-label="تصفية حسب الحالة" className="status-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">كل الحالات</option>{orderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="date-filter">من<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label><label className="date-filter">إلى<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label><span>{filteredOrders.length} طلب</span></div><OrdersTable orders={filteredOrders} updateOrder={updateOrder} onSelect={openOrder} /></div>}
		</section>
		{editor && 		<div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditor(null)}><form className="product-modal" onSubmit={saveProduct}><div className="modal-heading"><div><span className="eyebrow">{editor.id ? "تعديل منتج" : "منتج جديد"}</span><h2>{editor.id ? "تعديل تفاصيل المنتج" : "أضف منتج للمنيو"}</h2></div><button type="button" className="icon-button" onClick={() => setEditor(null)}><X size={20} /></button></div><div className="modal-body"><label className="upload-box">{preview ? <ProductImage imageUrl={preview} alt="معاينة الصورة" /> : <span className="upload-placeholder"><Plus size={22} /><b>ارفع صورة المنتج</b><small>JPG أو PNG أو WebP، بحد أقصى ٥ ميجابايت</small></span>}<input type="file" accept="image/jpeg,image/png,image/webp" required={!preview} onChange={(e) => selectImage(e.target.files?.[0] || null)} /></label><div className="field-grid"><label className="form-field full-field">اسم المنتج<input required value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} /></label><label className="form-field full-field">الوصف<textarea required value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} /></label><label className="form-field">السعر بالجنيه<input type="number" min="1" step="0.01" required value={editor.price} onChange={(e) => setEditor({ ...editor, price: e.target.value })} /></label><label className="form-field">التصنيف<select required value={editor.categoryId} onChange={(e) => setEditor({ ...editor, categoryId: e.target.value })}><option value="">اختر التصنيف</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{!category.active ? " (مخفي)" : ""}</option>)}</select></label><label className="form-field">نسبة الخصم %<input type="number" min="0" max="90" value={editor.discountPercent} onChange={(e) => setEditor({ ...editor, discountPercent: e.target.value })} /></label></div><div className="toggle-row"><label><input type="checkbox" checked={editor.available} onChange={(e) => setEditor({ ...editor, available: e.target.checked })} /><span>متاح للطلب</span></label><label><input type="checkbox" checked={editor.featured} onChange={(e) => setEditor({ ...editor, featured: e.target.checked })} /><span>منتج مميز</span></label></div></div><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setEditor(null)}>إلغاء</button><button className="button button-primary" disabled={busy}>{busy ? "جاري الحفظ..." : "حفظ المنتج"} <Check size={17} /></button></div></form></div>}
		{selectedOrder && <OrderDetails order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
	</main>;
}

function ProductsTable({ products, onEdit, onDelete }) {
	return <div className="table-scroll"><table className="admin-table"><thead><tr><th>المنتج</th><th>التصنيف</th><th>السعر</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><div className="table-product"><ProductImage imageUrl={product.imageUrl} alt="" /><span><b>{product.name}</b><small>{product.featured ? "منتج مميز" : "منتج عادي"}</small></span></div></td><td>{product.categoryName}</td><td><b>{formatPrice(product.currentPrice ?? product.price)}</b>{product.discountPercent > 0 && <small className="table-discount">خصم {product.discountPercent}%</small>}</td><td><span className={`status-pill ${product.available ? "status-active" : "status-off"}`}><i />{product.available ? "متاح" : "مخفي"}</span></td><td><div className="table-actions"><button onClick={() => onEdit(product)}>تعديل</button><button className="delete-action" onClick={() => onDelete(product)} aria-label="حذف"><Trash2 size={15} /></button></div></td></tr>)}</tbody></table>{!products.length && <div className="admin-empty">مفيش منتجات مطابقة.</div>}</div>;
}

function OrdersTable({ orders, updateOrder, onSelect }) {
	return <div className="table-scroll"><table className="admin-table orders-table"><thead><tr><th>رقم الطلب</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>الدفع</th><th>الحالة</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><button className="order-ref order-link" onClick={() => onSelect(order)}>#{order.orderNumber}</button></td><td><div><b>{order.customerName}</b><small className="table-subtext">{order.phone}</small></div></td><td>{new Date(order.createdAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</td><td><b>{formatPrice(order.total)}</b></td><td><span className="payment-pill">{order.paymentMethod === "Visa" ? `Visa · ${order.paymentStatus === "Paid" ? "مدفوع" : "غير مدفوع"}` : "كاش"}</span></td><td><select aria-label={`حالة الطلب ${order.orderNumber}`} className="status-select" value={order.status} onChange={(e) => updateOrder(order, e.target.value)}>{orderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td></tr>)}</tbody></table>{!orders.length && <div className="admin-empty">مفيش طلبات حاليًا.</div>}</div>;
}

function OrderDetails({ order, onClose }) {
	const status = orderStatuses.find(([value]) => value === order.status)?.[1] || order.status;
	return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="product-modal order-detail-modal"><div className="modal-heading"><div><span className="eyebrow">تفاصيل الطلب</span><h2>#{order.orderNumber}</h2></div><button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={20} /></button></div><div className="modal-body"><div className="order-detail-customer"><b>{order.customerName}</b><a href={`tel:${order.phone}`} dir="ltr">{order.phone}</a><span>{order.address}</span>{order.notes && <small>ملاحظات: {order.notes}</small>}</div><div className="order-detail-items">{order.items.map((item, index) => <div key={`${item.productName}-${index}`}><span>{item.quantity} × {item.productName}{item.note && <small>{item.note}</small>}</span><b>{formatPrice(item.unitPrice * item.quantity)}</b></div>)}</div><div className="order-detail-totals"><div><span>المجموع الفرعي</span><b>{formatPrice(order.subtotal)}</b></div><div><span>التوصيل</span><b>{formatPrice(order.deliveryFee)}</b></div><div><span>الإجمالي</span><b>{formatPrice(order.total)}</b></div></div><div className="order-detail-payment"><span>طريقة الدفع: {order.paymentMethod === "Visa" ? "بطاقة بنكية" : "كاش عند الاستلام"}</span><span>حالة الدفع: {order.paymentStatus === "Paid" ? "مدفوع" : order.paymentStatus === "Pending" ? "بانتظار الدفع" : order.paymentStatus}</span><span>حالة الطلب: {status}</span></div></div><div className="modal-actions"><button className="button button-dark" onClick={onClose}>إغلاق</button></div></section></div>;
}

function AdminPage() {
	const [loggedIn, setLoggedIn] = useState(Boolean(sessionStorage.getItem("kadry-admin-token")));
	const logout = () => { sessionStorage.removeItem("kadry-admin-token"); setLoggedIn(false); };
	return loggedIn ? <AdminDashboard onLogout={logout} /> : <AdminLogin onLogin={() => setLoggedIn(true)} />;
}

function AppContent() {
	const cart = useCart();
	const addToCart = (product, quantity, note) => {
		cart.add(product, quantity, note);
	};
	return <><Routes>
		<Route path="/admin/*" element={<AdminPage />} />
		<Route path="*" element={<><Header cartCount={cart.count} /><Routes>
			<Route path="/" element={<><HomePage onAdd={addToCart} /><Footer /></>} />
			<Route path="/menu" element={<><MenuPage onAdd={addToCart} /><Footer /></>} />
			<Route path="/menu/:id" element={<><ProductPage onAdd={addToCart} /><Footer /></>} />
			<Route path="/cart" element={<><CartPage cart={cart} /><Footer /></>} />
			<Route path="/checkout" element={<><CheckoutPage cart={cart} /><Footer /></>} />
			<Route path="/order-confirmation/:orderNumber" element={<><ConfirmationPage /><Footer /></>} />
		</Routes></>} />
	</Routes></>;
}

export default function App() {
	return <BrowserRouter><AppContent /></BrowserRouter>;
}
