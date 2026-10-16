import ImageWithFallback from "./ImageWithFallback";

function formatMoney(value, language, t) {
  if (value === null || value === undefined) {
    return t.notSpecified;
  }

  return `${new Intl.NumberFormat(language === "en" ? "en-US" : "th-TH").format(
    Number(value),
  )} ${t.baht}`;
}

function formatDistance(distanceKm, language, t) {
  if (distanceKm === null || distanceKm === undefined) {
    return t.notSpecified;
  }

  return `${new Intl.NumberFormat(language === "en" ? "en-US" : "th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(distanceKm))} ${t.distanceUnit}`;
}

function RecommendationCard({
  attraction,
  badgeLabel,
  type,
  language,
  t,
  isSelected = false,
  onToggleOptionalStop,
}) {
  const isCafe = type === "cafe";
  const price = formatMoney(attraction.package_free, language, t);
  const summary = attraction.free_remarks?.trim();

  return (
    <article
      className={`recommendation-card ${
        isCafe ? "cafe-recommendation-card" : "package-recommendation-card"
      }`}
    >
      {isCafe && (
        <div className="recommendation-card-image">
          <ImageWithFallback
            src={attraction.image_url}
            alt={attraction.name}
            className="recommendation-card-image-media"
            fallbackText={t.imageUnavailable}
          />
        </div>
      )}

      <div className="recommendation-card-content">
        <span className="recommendation-badge">{badgeLabel}</span>
        <h4>{attraction.name}</h4>
        {isCafe ? (
          <>
            <dl className="cafe-proximity-details">
              <div>
                <dt>{t.cafeRouteDay}</dt>
                <dd>{attraction.route_day ? t.routeDay(attraction.route_day) : t.notSpecified}</dd>
              </div>
              <div>
                <dt>{t.cafeRouteDistance}</dt>
                <dd>
                  {formatDistance(
                    attraction.nearest_route_distance_km,
                    language,
                    t,
                  )}
                </dd>
              </div>
            </dl>
            <p className="cafe-distance-method">{t.cafeRouteDistanceNote}</p>
            <p className="cafe-remarks">
              <strong>{t.feeRemarks}</strong> {summary || t.notSpecified}
            </p>
            {onToggleOptionalStop && (
              <button
                className={`optional-stop-button ${isSelected ? "selected" : ""}`}
                type="button"
                onClick={() => onToggleOptionalStop(attraction)}
                aria-pressed={isSelected}
              >
                {isSelected ? t.removeOptionalStop : t.addOptionalStop}
              </button>
            )}
          </>
        ) : (
          <>
            {summary && <p className="package-remarks">{summary}</p>}
            <div className="recommendation-meta">
              <span>
                {t.packagePriceLabel}: <strong>{price}</strong>
              </span>
              {attraction.duration_days !== null &&
                attraction.duration_days !== undefined && (
                  <span>
                    {t.durationDays}: {" "}
                    <strong>
                      {attraction.duration_days} {t.dayUnit}
                    </strong>
                  </span>
                )}
            </div>
            <p className="recommendation-provider">
              {t.providerLabel}: {" "}
              <strong>{attraction.source_name || t.notSpecified}</strong>
            </p>
          </>
        )}
        {!isCafe && attraction.source_url && (
          <a href={attraction.source_url} target="_blank" rel="noreferrer">
            {t.openSource}
          </a>
        )}
      </div>
    </article>
  );
}

export default RecommendationCard;
