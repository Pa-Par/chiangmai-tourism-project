function HeroSection({ children, t }) {
  return (
    <section className="hero-section">
      <div className="hero-overlay" />
      <div className="hero-content container">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>
          Chiang Mai <span>Nature Guide</span>
        </h1>
        <p className="hero-subtitle">
          {t.heroSubtitle}
        </p>
        {children}
      </div>
    </section>
  );
}

export default HeroSection;
