import bcast from '@windy/bcast';
import store from '@windy/store';
import map from '@windy/map';
import { selector } from '@windy/utils';

// Default ICS link if the user hasn't saved one yet
const DEFAULT_ICS = "https://itinerary.rvlife.com/trips/ics/525823/UEVjWVFlczQ3MFFLSDhkNFJ3ZWdRUT09";
const STORAGE_KEY = "windy_rv_ics_url";

export const onopen = () => {
  const savedIcs = localStorage.getItem(STORAGE_KEY) || DEFAULT_ICS;

  const container = selector.select('#plugin-rv-itinerary');
  container.innerHTML = `
    <div style="padding: 15px; color: #fff; font-family: sans-serif;">
      <h3 style="color: #f39c12; margin-top: 0;">🚐 RV Trip Calendar</h3>
      <p style="font-size: 0.85rem; color: #ccc;">Select a stop to jump the map and timeline directly to that location and date.</p>
      
      <div style="margin-bottom: 15px;">
        <label style="font-size: 0.8rem; color: #aaa;">Your ICS Calendar Link:</label>
        <input type="text" id="ics-url-input" value="${savedIcs}" placeholder="https://.../trip.ics" style="width: 100%; padding: 6px; margin-top: 4px; border-radius: 4px; border: 1px solid #444; background: #222; color: #fff; font-size: 0.8rem; box-sizing: border-box;" />
        <button id="btn-load-ics" style="margin-top: 6px; width: 100%; padding: 6px; background: #e74c3c; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Save & Sync Calendar</button>
      </div>

      <div id="itinerary-list" style="display: flex; flex-direction: column; gap: 10px; max-height: 450px; overflow-y: auto;">
        Loading itinerary...
      </div>
    </div>
  `;

  document.getElementById('btn-load-ics').addEventListener('click', () => {
    const newUrl = document.getElementById('ics-url-input').value.trim();
    if (newUrl) {
      localStorage.setItem(STORAGE_KEY, newUrl);
      loadICS(newUrl);
    }
  });

  loadICS(savedIcs);
};

// Simple lightweight ICS Parser
function parseICS(icsData) {
  const events = [];
  const lines = icsData.split(/\r\n|\n|\r/);
  let currentEvent = null;

  for (let line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      currentEvent = {};
    } else if (line.startsWith('END:VEVENT')) {
      if (currentEvent && (currentEvent.summary || currentEvent.location)) {
        events.push(currentEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith('SUMMARY:')) currentEvent.summary = line.replace('SUMMARY:', '').trim();
      if (line.startsWith('LOCATION:')) currentEvent.location = line.replace('LOCATION:', '').trim();
      if (line.startsWith('DTSTART')) {
        const val = line.split(':')[1];
        if (val) {
          // Parse YYYYMMDD format from ICS
          const yyyy = val.substring(0, 4);
          const mm = val.substring(4, 6);
          const dd = val.substring(6, 8);
          currentEvent.startDate = `${yyyy}-${mm}-${dd}`;
        }
      }
    }
  }
  return events;
}

async function loadICS(icsUrl) {
  const listContainer = document.getElementById('itinerary-list');
  listContainer.innerHTML = 'Fetching RV Life trip...';

  try {
    const res = await fetch(icsUrl);
    const text = await res.text();
    const events = parseICS(text);

    listContainer.innerHTML = '';

    if (events.length === 0) {
      listContainer.innerHTML = '<span style="color:#e74c3c;">No events found in this ICS file.</span>';
      return;
    }

    for (let event of events) {
      const searchTarget = event.location || event.summary;
      if (!searchTarget) continue;

      // Geocode location using Nominatim
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchTarget)}`);
      const geoData = await geoRes.json();

      if (geoData.length > 0) {
        const lat = parseFloat(geoData[0].lat);
        const lon = parseFloat(geoData[0].lon);

        const card = document.createElement('div');
        card.style.cssText = "background: #2a2a2a; padding: 10px; border-radius: 6px; border-left: 4px solid #3498db; cursor: pointer;";
        card.innerHTML = `
          <div style="font-weight: bold; color: #3498db;">${event.summary || searchTarget}</div>
          ${event.location ? `<div style="font-size: 0.8rem; color: #aaa;">📍 ${event.location}</div>` : ''}
          <div style="font-size: 0.85rem; color: #e67e22; margin-top: 4px;">📅 ${event.startDate || 'No date set'}</div>
        `;

        // Native Windy Control Trigger on Click
        card.addEventListener('click', () => {
          // 1. Re-center map
          map.setView([lat, lon], 8);

          // 2. Fire native forecast panel at location
          bcast.fire('openDetail', { lat, lon });

          // 3. Scrub timeline to start date at 12:00 PM
          if (event.startDate) {
            const targetDate = new Date(event.startDate + "T12:00:00");
            if (!isNaN(targetDate.getTime())) {
              store.set('timestamp', targetDate.getTime());
            }
          }
        });

        listContainer.appendChild(card);
      }
    }
  } catch (err) {
    console.error("ICS Error:", err);
    listContainer.innerHTML = '<span style="color:#e74c3c;">Failed to fetch ICS file. Check link or server permissions.</span>';
  }
}

export const onclose = () => {};