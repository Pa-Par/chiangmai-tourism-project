function Loading({ t }) {
  return (
    <div className="loading-backdrop" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="spinner-border text-success" aria-hidden="true" />
        <p>{t.loadingPlan}</p>
      </div>
    </div>
  );
}

export default Loading;
