import { useMemo, useState } from "react";

import RecommendationCard from "../components/RecommendationCard";
import { getZoneName } from "../i18n";

const PACKAGE_CATEGORY_NAMES = new Set(["แพ็คเกจทัวร์", "แพ็กเกจทัวร์"]);

function PackagePage({ attractions, zones, isLoading, language, t }) {
  const [zoneId, setZoneId] = useState("");
  const [maximumDays, setMaximumDays] = useState("");
  const [activityQuery, setActivityQuery] = useState("");

  const packages = useMemo(() => {
    const query = activityQuery.trim().toLocaleLowerCase();
    return attractions.filter((attraction) => {
      if (!PACKAGE_CATEGORY_NAMES.has(attraction.category_name)) return false;
      if (zoneId && Number(attraction.zone_id) !== Number(zoneId)) return false;
      if (maximumDays) {
        const durationDays = Number(attraction.duration_days);
        if (!Number.isFinite(durationDays) || durationDays > Number(maximumDays)) {
          return false;
        }
      }
      if (!query) return true;
      const searchableText = [
        attraction.name,
        attraction.description,
        attraction.free_remarks,
      ].filter(Boolean).join(" ").toLocaleLowerCase();
      return searchableText.includes(query);
    });
  }, [activityQuery, attractions, maximumDays, zoneId]);

  return (
    <section className="package-page">
      <div className="package-hero container">
        <p className="eyebrow">{t.packagePageEyebrow}</p>
        <h1>{t.packagePageTitle}</h1>
        <p>{t.packagePageDescription}</p>
      </div>

      <div className="container">
        <section className="package-filter-card" aria-label={t.packageFilters}>
          <div className="form-field">
            <label htmlFor="package-zone">{t.zone}</label>
            <select
              id="package-zone"
              className="form-select"
              value={zoneId}
              onChange={(event) => setZoneId(event.target.value)}
              disabled={isLoading}
            >
              <option value="">{t.allZones}</option>
              {zones.map((zone) => (
                <option key={zone.zone_id} value={zone.zone_id}>
                  {getZoneName(zone, language)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="package-duration">{t.packageDurationFilter}</label>
            <select
              id="package-duration"
              className="form-select"
              value={maximumDays}
              onChange={(event) => setMaximumDays(event.target.value)}
            >
              <option value="">{t.allDurations}</option>
              <option value="1">{t.upToDays(1)}</option>
              <option value="2">{t.upToDays(2)}</option>
              <option value="3">{t.upToDays(3)}</option>
            </select>
          </div>
          <div className="form-field package-activity-filter">
            <label htmlFor="package-activity">{t.packageActivityFilter}</label>
            <input
              id="package-activity"
              className="form-control"
              value={activityQuery}
              onChange={(event) => setActivityQuery(event.target.value)}
              placeholder={t.packageActivityPlaceholder}
            />
          </div>
        </section>

        <div className="package-results-heading">
          <div>
            <p className="section-kicker">{t.packageTours}</p>
            <h2>{t.packageSearchResults}</h2>
          </div>
          <strong>{t.packageResultCount(packages.length)}</strong>
        </div>

        {isLoading ? (
          <p className="route-empty-state">{t.loadingPackages}</p>
        ) : packages.length ? (
          <div className="package-card-grid">
            {packages.map((item) => (
              <RecommendationCard
                key={item.attraction_id}
                attraction={item}
                badgeLabel={t.packageTourBadge}
                type="package"
                language={language}
                t={t}
              />
            ))}
          </div>
        ) : (
          <p className="route-empty-state">{t.noPackagesFound}</p>
        )}
      </div>
    </section>
  );
}

export default PackagePage;
