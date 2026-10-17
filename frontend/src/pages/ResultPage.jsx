import { useCallback, useEffect, useMemo, useState } from "react";

import AdditionalRecommendations from "../components/AdditionalRecommendations";
import ItineraryTimeline from "../components/ItineraryTimeline";
import TransportationCard from "../components/TransportationCard";
import TripMap from "../components/TripMap";
import TripOverview from "../components/TripOverview";

function ResultPage({ result, onStartOver, cafeCandidates, language, t }) {
  const { itinerary } = result;
  const [displayedItinerary, setDisplayedItinerary] = useState(itinerary.itinerary || []);
  const [clientRoutePlan, setClientRoutePlan] = useState(null);
  const [selectedCafes, setSelectedCafes] = useState([]);

  useEffect(() => {
    setDisplayedItinerary(itinerary.itinerary || []);
    setClientRoutePlan(null);
    setSelectedCafes([]);
  }, [itinerary]);

  const handleRoutesComputed = useCallback((nextRoutePlan) => {
    setClientRoutePlan(nextRoutePlan);
    setDisplayedItinerary((currentItinerary) => {
      let hasChanged = false;
      const reorderedItinerary = currentItinerary.map((day) => {
        const routeDay = nextRoutePlan.days?.find(
          (item) => item.status === "success" && Number(item.day) === Number(day.day),
        );
        if (!routeDay?.ordered_attraction_ids?.length) return day;
        const attractionById = new Map(
          day.attractions.map((attraction) => [String(attraction.attraction_id), attraction]),
        );
        const reorderedAttractions = routeDay.ordered_attraction_ids
          .map((id) => attractionById.get(String(id)))
          .filter(Boolean);
        if (reorderedAttractions.length !== day.attractions.length) return day;
        const isSameOrder = reorderedAttractions.every(
          (attraction, index) => attraction.attraction_id === day.attractions[index].attraction_id,
        );
        if (isSameOrder) return day;
        hasChanged = true;
        return { ...day, attractions: reorderedAttractions };
      });
      return hasChanged ? reorderedItinerary : currentItinerary;
    });
  }, []);

  const toggleCafeStop = useCallback((cafe) => {
    setSelectedCafes((current) => current.some((item) => item.attraction_id === cafe.attraction_id)
      ? current.filter((item) => item.attraction_id !== cafe.attraction_id)
      : [...current, cafe]);
  }, []);

  const activeRoutePlan = clientRoutePlan || itinerary.route_plan || null;
  const displayedAttractionCount = useMemo(
    () => displayedItinerary.reduce((total, day) => total + day.attractions.length, 0),
    [displayedItinerary],
  );

  return (
    <section className="result-page">
      <div className="result-hero container">
        <p className="eyebrow">{t.resultEyebrow}</p>
        <h1>{t.resultTitle}</h1>
        <p>{t.resultDescription}</p>
        <button className="secondary-button" type="button" onClick={onStartOver}>
          {t.startOver}
        </button>
      </div>

      <div className="result-layout container">
        <aside className="result-sidebar">
          <TripOverview
            summary={{ ...itinerary.summary, attraction_count: displayedAttractionCount }}
            criteria={itinerary.criteria}
            language={language}
            t={t}
          />
          <TripMap
            itinerary={displayedItinerary}
            routePlan={activeRoutePlan}
            startLocations={itinerary.criteria?.start_locations}
            useSameStartLocation={itinerary.criteria?.use_start_location_each_day}
            onRoutesComputed={handleRoutesComputed}
            optionalCafes={selectedCafes}
            t={t}
          />
        </aside>

        <div className="result-main">
          <ItineraryTimeline
            itinerary={displayedItinerary}
            routePlan={activeRoutePlan}
            tripStartTime={itinerary.criteria?.trip_start_time}
            language={language}
            t={t}
          />
          <AdditionalRecommendations
            cafeCandidates={cafeCandidates}
            routePlan={activeRoutePlan}
            selectedCafes={selectedCafes}
            onToggleCafe={toggleCafeStop}
            language={language}
            t={t}
          />
          <TransportationCard
            recommendation={
              itinerary.transportation_recommendation ||
              itinerary.summary?.transportation_recommendation
            }
            summary={itinerary.gemini_summary}
            geminiStatus={itinerary.gemini?.status}
            t={t}
          />
        </div>
      </div>
    </section>
  );
}

export default ResultPage;
