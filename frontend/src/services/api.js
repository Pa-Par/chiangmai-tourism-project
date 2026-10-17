import axios from "axios";

const LOCAL_API_BASE_URL = "http://127.0.0.1:5000";

function normalizeApiBaseUrl(value) {
  const baseUrl = value?.trim().replace(/\/+$/, "");

  // API calls below already begin with "/api". This also lets an environment
  // variable safely contain either the Render root or the root ending in /api.
  return baseUrl?.endsWith("/api") ? baseUrl.slice(0, -4) : baseUrl;
}

const configuredApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
const API_BASE_URL = configuredApiBaseUrl || (
  import.meta.env.DEV ? LOCAL_API_BASE_URL : ""
);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

function getResponseData(response) {
  if (!response.data?.success) {
    throw new Error(response.data?.message || "ไม่สามารถเรียกข้อมูลจากระบบได้");
  }

  return response.data.data;
}

function requireApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า VITE_API_BASE_URL สำหรับเว็บที่เผยแพร่ โปรดตรวจสอบ Environment Variables ของ Vercel",
    );
  }
}

export async function getZones() {
  requireApiBaseUrl();
  return getResponseData(await api.get("/api/zones"));
}

export async function getCategories() {
  requireApiBaseUrl();
  return getResponseData(await api.get("/api/categories"));
}

export async function getAttractions(params = {}) {
  requireApiBaseUrl();
  return getResponseData(await api.get("/api/attractions", { params }));
}

export async function getAttractionById(attractionId) {
  requireApiBaseUrl();
  return getResponseData(await api.get(`/api/attractions/${attractionId}`));
}

export async function searchLocations(query, signal) {
  requireApiBaseUrl();
  return getResponseData(
    await api.get("/api/location-search", { params: { q: query }, signal }),
  );
}

export async function generateRecommendation(payload) {
  requireApiBaseUrl();
  return getResponseData(await api.post("/api/recommend", payload));
}

export { API_BASE_URL };
