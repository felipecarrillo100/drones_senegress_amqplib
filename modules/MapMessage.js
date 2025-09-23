// remapTract.js
function mapDroneMessage(rawMessage) {
  if (!rawMessage) return null;

  try {
    const trackID = rawMessage.system?.trackID || rawMessage.vehicleIdentification?.serial || null;

    const vehicleCoords = rawMessage.vehicleState?.location?.coordinates;
    const pilotCoords = rawMessage.pilotState?.location?.coordinates;

    if (!vehicleCoords) return null; // skip if no vehicle coordinates

    const properties = {
      trackID: trackID,
      vehicleSerial: rawMessage.vehicleIdentification?.serial || null,
      vehicleMAC: rawMessage.vehicleIdentification?.mac || null,
      vehicleType: rawMessage.vehicleIdentification?.uavType || null,
      heading: rawMessage.vehicleState?.orientation?.value || null,
      altitude: rawMessage.vehicleState?.altitudes?.geodetic?.value || null,
      state: rawMessage.vehicleState?.state || null,
      likelihood: rawMessage.vehicleState?.location?.likelihood || null,
      pilotOperatorID: rawMessage.pilotIdentification?.operatorID || null,
      pilotLocationType: rawMessage.pilotState?.locationType || null,
      pilotCoordinates: pilotCoords || null,
      timestamps: rawMessage.system?.timestampLog || null,
      fusionType: rawMessage.system?.fusionState?.fusionType || null,
      sourceSerials: rawMessage.system?.fusionState?.sourceSerials || null
    };

    return {
      action: 'PUT',
      geometry: {
        type: 'Point',
        coordinates: [vehicleCoords.lon, vehicleCoords.lat, properties.vehicleAltitude]
      },
      id: trackID, // using trackID as unique identifier
      properties
    };
  } catch (err) {
    console.error('Failed to remap message:', err);
    return null;
  }
}

function mapMannedAviationMessage(msgArray) {
  if (!msgArray) return null;
  if (!msgArray.length===0) return null;
  const msg = msgArray[0];

  try {
    if (typeof msg.lat !== 'number' || typeof msg.lon !== 'number') {
      return null; // skip if coordinates are invalid
    }

    const trackID = msg.track_id || msg.hex || null; // fallback if track_id missing

    const properties = {
      flight: msg.fli || null,
      altitude: msg.alt || null,
      speed: msg.spd || null,
      heading: msg.trk || null,
      trueHeading: msg.tru || null,
      verticalRate: msg.vrt || null,
      category: msg.cat || null,
      availability: msg.ava || null,
      service: msg.srv || null,
      distance: msg.dis || null,
      icao: msg.icao || null,
      hex: msg.hex || null,
      sensorSerials: Array.isArray(msg.sensor_serials) ? msg.sensor_serials : [],
      timestamp: msg.uti || null
    };

    return {
      action: 'PUT',
      geometry: {
        type: 'Point',
        coordinates: [msg.lon, msg.lat, msg.alt]
      },
      id: trackID,
      properties
    };
  } catch (err) {
    console.error('Failed to map manned aviation message:', err);
    return null;
  }
}

module.exports = { mapDroneMessage, mapMannedAviationMessage };
