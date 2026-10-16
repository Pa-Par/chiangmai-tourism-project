import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

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

export async function getZones() {
  return getResponseData(await api.get("/api/zones"));
}

export async function getCategories() {
  return getResponseData(await api.get("/api/categories"));
}

export async function getAttractions(params = {}) {
  return getResponseData(await api.get("/api/attractions", { params }));
}

export async function getAttractionById(attractionId) {
  return getResponseData(await api.get(`/api/attractions/${attractionId}`));
}

export async function generateRecommendation(payload) {
  return getResponseData(await api.post("/api/recommend", payload));
}

export { API_BASE_URL };
