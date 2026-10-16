import { useEffect, useState } from "react";

import Header from "./components/Header";
import Loading from "./components/Loading";
import HomePage from "./pages/HomePage";
import PackagePage from "./pages/PackagePage";
import ResultPage from "./pages/ResultPage";
import { translations } from "./i18n";
import {
  generateRecommendation,
  getAttractions,
  getCategories,
  getZones,
} from "./services/api";

function App() {
  const [categories, setCategories] = useState([]);
  const [zones, setZones] = useState([]);
  const [attractions, setAttractions] = useState([]);
  const [mapCenter, setMapCenter] = useState(null);
  const [setupError, setSetupError] = useState("");
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [activePage, setActivePage] = useState("planner");
  const [language, setLanguage] = useState("th");
  const t = translations[language];

  useEffect(() => {
    async function loadFormOptions() {
      try {
        const [categoryData, zoneData, attractionData] = await Promise.all([
          getCategories(),
          getZones(),
          getAttractions(),
        ]);
        setCategories(categoryData);
        setZones(zoneData);
        setAttractions(attractionData);
        const coordinates = attractionData
          .map((attraction) => ({
            latitude: Number(attraction.latitude),
            longitude: Number(attraction.longitude),
          }))
          .filter((point) => (
            Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
            point.latitude >= -90 && point.latitude <= 90 &&
            point.longitude >= -180 && point.longitude <= 180 &&
            point.latitude !== 0 && point.longitude !== 0
          ));
        if (coordinates.length) {
          const median = (values) => {
            const sorted = [...values].sort((first, second) => first - second);
            return sorted[Math.floor(sorted.length / 2)];
          };
          setMapCenter({
            latitude: median(coordinates.map((point) => point.latitude)),
            longitude: median(coordinates.map((point) => point.longitude)),
          });
        }
      } catch (error) {
        setSetupError(
          error.response?.data?.message ||
            error.message ||
            "ไม่สามารถโหลดข้อมูลประเภทและโซนท่องเที่ยวได้",
        );
      } finally {
        setIsLoadingOptions(false);
      }
    }

    loadFormOptions();
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title =
      language === "en" ? "Chiang Mai Nature Guide" : "Chiang Mai Nature Guide | เชียงใหม่";
  }, [language]);

  async function handleGenerate(formData) {
    setIsGenerating(true);
    try {
      const tripDays = Number(formData.days);
      const startLocations = Object.entries(formData.startLocations)
        .map(([day, location]) => ({
          day: Number(day),
          name: location.name?.trim() || null,
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
        }))
        .filter((location) => (
          location.day >= 1 && location.day <= tripDays &&
          Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
        ));
      const dayOneStartLocation = startLocations.find((location) => location.day === 1) || null;
      const itinerary = await generateRecommendation({
        days: tripDays,
        trip_start_time: formData.tripStartTime,
        category_ids: formData.categoryIds,
        zone_id: formData.zoneId ? Number(formData.zoneId) : null,
        start_location: dayOneStartLocation,
        start_locations: startLocations,
        use_start_location_each_day:
          Boolean(dayOneStartLocation && formData.useStartLocationEachDay),
      });

      setResult({ itinerary });
      setActivePage("planner");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsGenerating(false);
    }
  }

  function returnHome() {
    setResult(null);
    setActivePage("planner");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPackages() {
    setResult(null);
    setActivePage("packages");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <Header
        onHomeClick={returnHome}
        onPackagesClick={openPackages}
        activePage={activePage}
        showBackButton={Boolean(result) || activePage === "packages"}
        language={language}
        onLanguageChange={setLanguage}
        t={t}
      />
      <main>
        {activePage === "packages" ? (
          <PackagePage
            attractions={attractions}
            zones={zones}
            isLoading={isLoadingOptions}
            language={language}
            t={t}
          />
        ) : result ? (
          <ResultPage
            result={result}
            onStartOver={returnHome}
            cafeCandidates={attractions.filter((attraction) => attraction.category_name === "คาเฟ่")}
            language={language}
            t={t}
          />
        ) : (
          <HomePage
            categories={categories}
            zones={zones}
            mapCenter={mapCenter}
            setupError={setupError}
            isLoadingOptions={isLoadingOptions}
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
            language={language}
            t={t}
          />
        )}
      </main>
      {isGenerating && <Loading t={t} />}
    </>
  );
}

export default App;
