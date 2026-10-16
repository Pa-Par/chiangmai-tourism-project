import { useMemo, useState } from "react";

import {
  getCategoryName,
  getZoneName,
  isPrimaryAttractionCategory,
} from "../i18n";
import StartLocationPicker from "./StartLocationPicker";

function TripForm({
  categories,
  zones,
  mapCenter,
  isLoadingOptions,
  isGenerating,
  onGenerate,
  language,
  t,
}) {
  const [formData, setFormData] = useState({
    days: 2,
    tripStartTime: "08:00",
    categoryIds: [],
    zoneId: "",
    startLocations: {},
    useStartLocationEachDay: false,
  });
  const [activeStartDay, setActiveStartDay] = useState(1);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const primaryCategories = categories.filter(isPrimaryAttractionCategory);
  const selectedDays = useMemo(() => {
    const value = Number(formData.days);
    return Number.isInteger(value) && value > 0 ? value : 1;
  }, [formData.days]);
  const startDayOptions = formData.useStartLocationEachDay
    ? [1]
    : Array.from({ length: selectedDays }, (_, index) => index + 1);
  const currentStartDay = startDayOptions.includes(activeStartDay)
    ? activeStartDay
    : 1;
  const activeStartLocation = formData.startLocations[currentStartDay] || {};

  function updateField(field, value) {
    setFormData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "", startLocations: "" }));
    setRequestError("");
  }

  function updateStartLocation(day, nextLocation) {
    setFormData((current) => ({
      ...current,
      startLocations: {
        ...current.startLocations,
        [day]: { ...current.startLocations[day], ...nextLocation },
      },
    }));
    setErrors((current) => ({ ...current, startLocations: "" }));
    setRequestError("");
  }

  function toggleCategory(categoryId) {
    setFormData((current) => {
      const categoryIds = current.categoryIds.includes(categoryId)
        ? current.categoryIds.filter((id) => id !== categoryId)
        : [...current.categoryIds, categoryId];
      return { ...current, categoryIds };
    });
    setErrors((current) => ({ ...current, categoryIds: "" }));
    setRequestError("");
  }

  function validateStartLocations() {
    const locations = formData.startLocations;
    const selectedLocationDays = Object.keys(locations)
      .map(Number)
      .filter((day) => day >= 1 && day <= selectedDays);
    const hasAnyLocation = selectedLocationDays.some((day) => {
      const location = locations[day];
      return [location?.name, location?.latitude, location?.longitude]
        .some((value) => String(value ?? "").trim() !== "");
    });

    if (!hasAnyLocation) return "";
    if (formData.useStartLocationEachDay && !locations[1]) {
      return t.sharedStartLocationError;
    }
    for (const day of selectedLocationDays) {
      const location = locations[day];
      const latitude = Number(location?.latitude);
      const longitude = Number(location?.longitude);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
      ) {
        return t.startLocationCoordinatesError;
      }
    }
    return "";
  }

  function validate() {
    const nextErrors = {};
    const dayValue = Number(formData.days);
    if (!Number.isInteger(dayValue) || dayValue <= 0) nextErrors.days = t.daysError;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(formData.tripStartTime)) {
      nextErrors.tripStartTime = t.tripStartTimeError;
    }
    if (formData.categoryIds.length === 0) nextErrors.categoryIds = t.categoriesError;
    const startLocationsError = validateStartLocations();
    if (startLocationsError) nextErrors.startLocations = startLocationsError;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate() || isGenerating) return;
    try {
      await onGenerate(formData);
    } catch (error) {
      setRequestError(error.response?.data?.message || error.message || t.requestError);
    }
  }

  return (
    <form className="trip-form-card" onSubmit={handleSubmit} noValidate>
      <div className="form-heading">
        <div>
          <p className="section-kicker">{t.yourJourney}</p>
          <h2>{t.startPlanning}</h2>
        </div>
        <span className="form-leaf" aria-hidden="true">❋</span>
      </div>

      {requestError && <div className="form-alert">{requestError}</div>}

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="days">{t.days}</label>
          <input id="days" className={`form-control ${errors.days ? "is-invalid" : ""}`} type="number" min="1" step="1" value={formData.days} onChange={(event) => updateField("days", event.target.value)} />
          {errors.days && <small className="field-error">{errors.days}</small>}
        </div>

        <div className="form-field">
          <label htmlFor="trip-start-time">{t.tripStartTime}</label>
          <input
            id="trip-start-time"
            className={`form-control ${errors.tripStartTime ? "is-invalid" : ""}`}
            type="time"
            value={formData.tripStartTime}
            onChange={(event) => updateField("tripStartTime", event.target.value)}
          />
          <small className="field-hint">{t.tripStartTimeHint}</small>
          {errors.tripStartTime && <small className="field-error">{errors.tripStartTime}</small>}
        </div>

        <div className="form-field form-field-wide">
          <label>{t.categories}</label>
          <div className="category-options" aria-label={t.categories}>
            {isLoadingOptions ? <span className="option-loading">{t.loadingCategories}</span> : primaryCategories.map((category) => {
              const selected = formData.categoryIds.includes(category.category_id);
              return (
                <label className={`category-option ${selected ? "selected" : ""}`} key={category.category_id}>
                  <input type="checkbox" checked={selected} onChange={() => toggleCategory(category.category_id)} />
                  <span>{getCategoryName(category, language)}</span>
                </label>
              );
            })}
          </div>
          {errors.categoryIds && <small className="field-error">{errors.categoryIds}</small>}
        </div>

        <div className="form-field">
          <label htmlFor="zone">{t.zone}</label>
          <select id="zone" className="form-select" value={formData.zoneId} onChange={(event) => updateField("zoneId", event.target.value)} disabled={isLoadingOptions}>
            <option value="">{t.allZones}</option>
            {zones.map((zone) => <option key={zone.zone_id} value={zone.zone_id}>{getZoneName(zone, language)}</option>)}
          </select>
        </div>

        <div className="form-field form-field-wide start-location-field">
          <label>{t.startLocation}</label>
          {selectedDays > 1 && (
            <label className="start-location-repeat">
              <input type="checkbox" checked={formData.useStartLocationEachDay} onChange={(event) => {
                updateField("useStartLocationEachDay", event.target.checked);
                setActiveStartDay(1);
              }} />
              <span>{t.startLocationEachDay}</span>
            </label>
          )}
          <div className="start-day-tabs" role="tablist" aria-label={t.startLocationDays}>
            {startDayOptions.map((day) => (
              <button key={day} type="button" className={currentStartDay === day ? "active" : ""} onClick={() => setActiveStartDay(day)}>
                {formData.useStartLocationEachDay ? t.sharedStartLocation : t.routeDay(day)}
              </button>
            ))}
          </div>
          <StartLocationPicker
            key={currentStartDay}
            day={currentStartDay}
            location={activeStartLocation}
            mapCenter={mapCenter}
            onLocationChange={(location) => updateStartLocation(currentStartDay, location)}
            t={t}
          />
          <small className="field-hint">{t.startLocationHint}</small>
          {errors.startLocations && <small className="field-error">{errors.startLocations}</small>}
        </div>
      </div>

      <button className="generate-button" type="submit" disabled={isGenerating || isLoadingOptions}>
        <span aria-hidden="true">✦</span><span>{t.generate}</span><small>{t.generateEnglish}</small>
      </button>
    </form>
  );
}

export default TripForm;
