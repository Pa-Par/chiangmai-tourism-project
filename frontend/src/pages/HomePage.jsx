import HeroSection from "../components/HeroSection";
import TripForm from "../components/TripForm";

function HomePage({
  categories,
  zones,
  mapCenter,
  setupError,
  isLoadingOptions,
  isGenerating,
  onGenerate,
  language,
  t,
}) {
  return (
    <HeroSection t={t}>
      {setupError ? (
        <div className="api-error-card">
          <strong>{t.apiErrorTitle}</strong>
          <span>{setupError}</span>
        </div>
      ) : (
        <TripForm
          categories={categories}
          zones={zones}
          mapCenter={mapCenter}
          isLoadingOptions={isLoadingOptions}
          isGenerating={isGenerating}
          onGenerate={onGenerate}
          language={language}
          t={t}
        />
      )}
    </HeroSection>
  );
}

export default HomePage;
