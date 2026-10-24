import axios from "axios";

export const api = axios.create({
	baseURL: import.meta.env.VITE_API_URL || "http://localhost:5080/api",
	timeout: 15000,
});

export function getImageUrl(imageUrl) {
	if (typeof imageUrl !== "string" || !imageUrl.trim()) return "/food-placeholder.svg";

	try {
		const backendOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
		const resolvedUrl = new URL(imageUrl.trim(), `${backendOrigin}/`);
		if (["http:", "https:", "blob:", "data:"].includes(resolvedUrl.protocol)) return resolvedUrl.href;
	} catch {
		return "/food-placeholder.svg";
	}

	return "/food-placeholder.svg";
}

api.interceptors.request.use((config) => {
	const token = sessionStorage.getItem("kadry-admin-token");
	if (token) config.headers.Authorization = `Bearer ${token}`;
	return config;
});

export function getErrorMessage(error) {
	if (axios.isAxiosError(error)) {
		if (error.response?.data?.message) return error.response.data.message;
		if (error.response?.data?.title) return error.response.data.title;
		if (error.code === "ECONNABORTED") return "استغرق الاتصال وقتًا أطول من المتوقع. حاول مرة أخرى.";
		if (error.response?.status === 401) return "بيانات الدخول غير صحيحة أو انتهت الجلسة.";
		if (!error.response) return "تعذر الاتصال بالخادم. تأكد أن خدمة الطلبات تعمل ثم حاول مرة أخرى.";
	}
	return error instanceof Error ? error.message : "حصلت مشكلة غير متوقعة. حاول مرة أخرى.";
}

export function formatPrice(value) {
	return new Intl.NumberFormat("ar-EG", {
		style: "currency",
		currency: "EGP",
		maximumFractionDigits: 2,
	}).format(value || 0);
}
