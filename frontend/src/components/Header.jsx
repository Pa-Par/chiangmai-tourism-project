function Header({
  onHomeClick,
  onPackagesClick,
  activePage,
  showBackButton,
  language,
  onLanguageChange,
  t,
}) {
  return (
    <header className={`site-header ${showBackButton ? "has-back-button" : ""}`}>
      <button className="brand" type="button" onClick={onHomeClick}>
        <span className="brand-mark" aria-hidden="true">
          ✦
        </span>
        <span>
          <strong>Chiang Mai</strong>
          <small>Nature Guide</small>
        </span>
      </button>

      <div className="header-actions">
        <button
          className={`header-nav-button ${activePage === "packages" ? "active" : ""}`}
          type="button"
          onClick={onPackagesClick}
          aria-current={activePage === "packages" ? "page" : undefined}
        >
          {t.packageTours}
        </button>
        <div className="language-switch" role="group" aria-label="Language">
          <button
            className={language === "th" ? "active" : ""}
            type="button"
            onClick={() => onLanguageChange("th")}
            aria-pressed={language === "th"}
          >
            {t.languageThai}
          </button>
          <button
            className={language === "en" ? "active" : ""}
            type="button"
            onClick={() => onLanguageChange("en")}
            aria-pressed={language === "en"}
          >
            {t.languageEnglish}
          </button>
        </div>

        {showBackButton && (
          <button className="back-home-button" type="button" onClick={onHomeClick}>
            {t.backToPlanner}
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
