import RecommendationCard from "./RecommendationCard";
import { getRouteCafeRecommendations } from "../services/routeCafeProximity";

const MAX_ROUTE_DISTANCE_KM = 5;
const MAX_VISIBLE_CAFES = 3;

function AdditionalRecommendations({
  cafeCandidates,
  routePlan,
  selectedCafes,
  onToggleCafe,
  language,
  t,
}) {
  const cafes = getRouteCafeRecommendations(cafeCandidates, routePlan, {
    maxDistanceKm: MAX_ROUTE_DISTANCE_KM,
    limit: MAX_VISIBLE_CAFES,
  });
  const routeReady = Boolean(cafes.length) || routePlan?.days?.some(
    (day) => day.status === "success" && Array.isArray(day.path) && day.path.length > 1,
  );
  return (
    <section className="additional-recommendations" aria-labelledby="additional-title">
      <div className="additional-heading">
        <div>
          <p className="section-kicker">{t.additionalRecommendationsEyebrow}</p>
          <h2 id="additional-title">{t.additionalRecommendations}</h2>
        </div>
        <span aria-hidden="true">✦</span>
      </div>

      <p className="additional-intro">{t.routeCafeDescription}</p>
      <section className="recommendation-group">
        <div className="recommendation-group-heading">
          <span aria-hidden="true">☕</span>
          <h3>{t.routeCafes}</h3>
        </div>
        {!routeReady ? (
          <p className="no-additional-recommendations">{t.routeCafeUnavailable}</p>
        ) : cafes.length ? (
          <div className="supplementary-card-list">
            {cafes.map((cafe) => (
              <RecommendationCard
                key={cafe.attraction_id}
                attraction={cafe}
                badgeLabel={t.cafeBadge}
                type="cafe"
                language={language}
                t={t}
                isSelected={selectedCafes.some((item) => item.attraction_id === cafe.attraction_id)}
                onToggleOptionalStop={onToggleCafe}
              />
            ))}
          </div>
        ) : (
          <p className="no-additional-recommendations">{t.noRouteCafesFound}</p>
        )}
      </section>
      {selectedCafes.length > 0 && <p className="optional-stop-note">{t.optionalStopNote}</p>}
    </section>
  );
}

export default AdditionalRecommendations;
