function TransportationCard({ recommendation, summary, geminiStatus, t }) {
  return (
    <section className="transportation-card result-card">
      <div className="transport-icon" aria-hidden="true">
        ⟡
      </div>
      <div>
        <p className="section-kicker">{t.travelAdviceEyebrow}</p>
        <h2>{t.travelAdvice}</h2>
        <p>
          {recommendation ||
            t.travelAdviceFallback}
        </p>
        {geminiStatus === "used" && summary && (
          <div className="gemini-summary">
            <strong>{t.geminiTripSummary}</strong>
            <p>{summary}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default TransportationCard;
