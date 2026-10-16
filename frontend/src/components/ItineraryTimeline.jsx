import AttractionCard from "./AttractionCard";
import {
  createDaySchedule,
  DEFAULT_TRIP_START_TIME,
  timeToMinutes,
} from "../services/itinerarySchedule";

function formatTime(totalMinutes, t) {
  if (!Number.isFinite(totalMinutes)) return t.notAvailable;
  const normalizedMinutes = totalMinutes % (24 * 60);
  const dayOffset = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  const suffix = t.timeSuffix ? ` ${t.timeSuffix}` : "";
  const nextDay = dayOffset > 0 ? ` ${t.nextDayOffset(dayOffset)}` : "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}${suffix}${nextDay}`;
}

function formatDuration(minutes, t) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} ${t.minute}`;
  if (remainingMinutes === 0) return `${hours} ${t.hour}`;
  return `${hours} ${t.hour} ${remainingMinutes} ${t.minute}`;
}

function ItineraryTimeline({ itinerary, routePlan, tripStartTime, language, t }) {
  const normalizedStartTime = timeToMinutes(tripStartTime) === null
    ? DEFAULT_TRIP_START_TIME
    : tripStartTime;
  return (
    <section className="itinerary-section">
      <div className="itinerary-heading">
        <div>
          <p className="section-kicker">{t.itineraryEyebrow}</p>
          <h1>{t.itinerary}</h1>
          <p>Itinerary</p>
        </div>
        <small className="schedule-rule">{t.scheduleRule(normalizedStartTime)}</small>
      </div>

      {itinerary.map((day) => {
        const routeDay = routePlan?.days?.find((item) => item.day === day.day);
        const schedule = createDaySchedule(day.attractions, routeDay, normalizedStartTime);
        const totalDuration = day.attractions.reduce(
          (total, attraction) => total + Number(attraction.visit_duration || 0),
          0,
        );
        return (
          <section className="day-plan" key={day.day}>
            <div className="day-label">
              <span>{t.dayPrefix}</span>
              <strong>{day.day}</strong>
              {totalDuration > 0 && <small>{formatDuration(totalDuration, t)}</small>}
            </div>
            <div className="day-timeline">
              {schedule.length > 0 ? schedule.map((item) => (
                <div className="timeline-item" key={item.attraction.attraction_id}>
                  <div className="timeline-marker" aria-hidden="true"><span /></div>
                  <div className="timeline-time">
                    <strong>{formatTime(item.arrivalTime, t)}</strong>
                    <small>{t.arrivalTime}</small>
                    <em>{t.departureTime} {formatTime(item.departureTime, t)}</em>
                    {item.hasRoadTravelTime ? (
                      <i>{t.roadTravelTime} {formatDuration(item.travelMinutes, t)}</i>
                    ) : (
                      <i>{t.travelTimePending}</i>
                    )}
                    {item.visitStartTime !== null && (
                      <i>{t.visitStartTime} {formatTime(item.visitStartTime, t)}</i>
                    )}
                    {item.leaveTime !== null && (
                      <i>{t.leaveTime} {formatTime(item.leaveTime, t)}</i>
                    )}
                    {item.hasVisitDuration && (
                      <i>{t.visitDurationFromData} {formatDuration(Number(item.attraction.visit_duration), t)}</i>
                    )}
                    {item.waitingMinutes > 0 && (
                      <b>{t.waitForOpening(formatDuration(item.waitingMinutes, t))}</b>
                    )}
                    {item.arrivesAfterClosing && <b>{t.arrivesAfterClosing}</b>}
                    {!item.arrivesAfterClosing && item.exceedsClosingTime && <b>{t.mayExceedClosing}</b>}
                  </div>
                  <AttractionCard attraction={item.attraction} language={language} t={t} />
                </div>
              )) : <div className="empty-day">{t.noAttractions}</div>}
            </div>
          </section>
        );
      })}
    </section>
  );
}

export default ItineraryTimeline;
