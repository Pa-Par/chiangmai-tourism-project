function formatMoney(value, language) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "th-TH").format(
    Number(value || 0),
  );
}

function TripOverview({ summary, criteria, language, t }) {
  const costDetails = summary.main_itinerary_cost_details || [];

  const metrics = [
    { label: t.daysLabel, value: `${criteria.days} ${t.dayUnit}`, icon: "◷" },
    {
      label: t.mainAttractionCost,
      value: `${formatMoney(summary.main_attractions_cost, language)} ${t.baht}`,
      icon: "◌",
    },
    {
      label: t.attractionCount,
      value: `${summary.selected_attraction_count} ${t.placeUnit}`,
      icon: "⌖",
    },
  ];

  return (
    <section className="overview-card result-card">
      <p className="section-kicker">TRIP OVERVIEW</p>
      <h2>{t.tripOverview}</h2>
      <div className="overview-grid">
        {metrics.map((metric) => (
          <div className="overview-metric" key={metric.label}>
            <span aria-hidden="true">{metric.icon}</span>
            <div>
              <small>{metric.label}</small>
              <strong>{metric.value}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="overview-footer">
        <span>{t.costEstimateNote}</span>
      </div>
      <div className="cost-breakdown" aria-label={t.costBreakdown}>
        <h3>{t.costBreakdown}</h3>
        {costDetails.map((item) => (
          <div key={`${item.day}-${item.attraction_id}`}>
            <span>{item.name}</span>
            <strong>{item.cost_available === false
              ? t.notSpecified
              : `${formatMoney(item.estimated_cost, language)} ${t.baht}`}
            </strong>
          </div>
        ))}
        <div className="cost-breakdown-total">
          <span>{t.costTotal}</span>
          <strong>{formatMoney(summary.main_attractions_cost, language)} {t.baht}</strong>
        </div>
      </div>
      {summary.unavailable_cost_attraction_count > 0 && (
        <p className="cost-data-note">{t.costDataIncomplete}</p>
      )}
    </section>
  );
}

export default TripOverview;
