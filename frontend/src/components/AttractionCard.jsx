import { getCategoryName } from "../i18n";
import ImageWithFallback from "./ImageWithFallback";

function formatCost(value, language, t) {
  return `${new Intl.NumberFormat(
    language === "en" ? "en-US" : "th-TH",
  ).format(Number(value))} ${t.baht}`;
}

function formatDuration(minutes, t) {
  if (minutes === null || minutes === undefined) {
    return t.notSpecified;
  }

  const totalMinutes = Number(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} ${t.minute}`;
  }
  if (remainingMinutes === 0) {
    return `${hours} ${t.hour}`;
  }

  return `${hours} ${t.hour} ${remainingMinutes} ${t.minute}`;
}

function formatOpeningHours(attraction, t) {
  if (!attraction.open_time || !attraction.close_time) {
    return t.notSpecified;
  }

  const suffix = t.timeSuffix ? ` ${t.timeSuffix}` : "";
  return `${attraction.open_time.slice(0, 5)} - ${attraction.close_time.slice(0, 5)}${suffix}`;
}

function CostItem({ label, value, language, t }) {
  return (
    <div className="cost-item">
      <span>{label}</span>
      <strong>{formatCost(value, language, t)}</strong>
    </div>
  );
}

function formatDurationDays(durationDays, t) {
  if (durationDays === null || durationDays === undefined) {
    return t.notSpecified;
  }

  return `${durationDays} ${t.dayUnit}`;
}

function AttractionCard({ attraction, language, t, badgeLabel }) {
  const feeItems = [
    { label: t.thaiAdult, value: attraction.thai_free },
    { label: t.thaiChild, value: attraction.thaichild_free },
    { label: t.foreignAdult, value: attraction.foreigner_free },
    { label: t.foreignChild, value: attraction.foreignerchild_free },
    { label: t.vehicleFee, value: attraction.vehicle_free },
    { label: t.packageFee, value: attraction.package_free },
  ];
  const paidFeeItems = feeItems.filter(({ value }) => Number(value) > 0);
  const hasKnownFee = feeItems.some(
    ({ value }) =>
      value !== null &&
      value !== undefined &&
      Number.isFinite(Number(value)),
  );

  return (
    <article className="attraction-card">
      <div className="attraction-image">
        <ImageWithFallback
          src={attraction.image_url}
          alt={attraction.name}
          className="attraction-image-media"
          fallbackText={t.imageUnavailable}
        />
      </div>

      <div className="attraction-content">
        <span className="category-badge">
          {badgeLabel || getCategoryName(attraction, language) || t.notSpecified}
        </span>
        <h3>{attraction.name}</h3>

        <section className="description-section">
          <h4>{t.description}</h4>
          <p>{attraction.description || t.notSpecified}</p>
        </section>

        <div className="visit-detail-grid">
          <div className="visit-detail">
            <span>{t.suggestedVisitTime}</span>
            <strong>⏱ {formatDuration(attraction.visit_duration, t)}</strong>
          </div>
          <div className="visit-detail">
            <span>{t.openingHours}</span>
            <strong>🕐 {formatOpeningHours(attraction, t)}</strong>
          </div>
          {attraction.duration_days !== null &&
            attraction.duration_days !== undefined && (
              <div className="visit-detail">
                <span>{t.durationDays}</span>
                <strong>◷ {formatDurationDays(attraction.duration_days, t)}</strong>
              </div>
            )}
        </div>

        <section className="cost-section">
          <h4>{t.admissionFee}</h4>
          {paidFeeItems.length > 0 ? (
            <div className="cost-grid">
              {paidFeeItems.map((feeItem) => (
                <CostItem
                  key={feeItem.label}
                  {...feeItem}
                  language={language}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <p className="free-entry">
              {hasKnownFee ? t.freeEntrance : t.notSpecified}
            </p>
          )}
          {attraction.free_remarks && (
            <p className="cost-remarks">
              <strong>{t.feeRemarks}</strong> {attraction.free_remarks}
            </p>
          )}
        </section>

        {(attraction.source_name || attraction.source_url) && (
          <section className="source-section">
            <h4>{t.source}</h4>
            {attraction.source_name && <p>{attraction.source_name}</p>}
            {attraction.source_url && (
              <a href={attraction.source_url} target="_blank" rel="noreferrer">
                {t.openSource}
              </a>
            )}
          </section>
        )}
      </div>
    </article>
  );
}

export default AttractionCard;
