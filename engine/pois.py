from __future__ import annotations

POIS = {
    "Smith Street Grocery": {"lat": 40.7315, "lon": -73.9972},
    "Boerum Hill Public Library": {"lat": 40.7298, "lon": -73.9935},
    "Atlantic Avenue Community Center": {"lat": 40.7305, "lon": -73.9965},
    "Nevins Street Park": {"lat": 40.7322, "lon": -73.9948},
    "Brooklyn Borough Hall": {"lat": 40.7325, "lon": -73.9901},
    "St. Agnes Catholic Church": {"lat": 40.7290, "lon": -73.9978},
    "Dean Street Coffee": {"lat": 40.7312, "lon": -73.9958},
    "Pacific Drug Pharmacy": {"lat": 40.7301, "lon": -73.9945},
    "PS 261 School": {"lat": 40.7288, "lon": -73.9925},
    "Hoyt-Schermerhorn Subway Station": {"lat": 40.7278, "lon": -73.9852},
    "Boerum Community Garden": {"lat": 40.7335, "lon": -73.9962},
    "The Schermerhorn Bar": {"lat": 40.7308, "lon": -73.9980},
}

POI_NAMES = list(POIS.keys())

ALL_LOCATIONS = {"home": None, "work": None, **POIS}
