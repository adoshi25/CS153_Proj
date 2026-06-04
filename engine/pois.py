from __future__ import annotations

# Coordinates derived from the 2048x2048 city map image.
# Bounds: latMax=40.7355, latMin=40.7245, lonMin=-74.001, lonMax=-73.989
# Formula: lat = 40.7355 - (y/2048)*0.011 | lon = -74.001 + (x/2048)*0.012

POIS = {
    "City Harbor Park":                 {"lat": 40.7337, "lon": -73.9988},
    "Russell Gates":                    {"lat": 40.7331, "lon": -73.9992},
    "Botanic Gardens":                  {"lat": 40.7341, "lon": -73.9942},
    "Garden Gates":                     {"lat": 40.7342, "lon": -73.9917},
    "Park":                             {"lat": 40.7327, "lon": -73.9915},
    "City International Airport":       {"lat": 40.7347, "lon": -73.9892},
    "Air Cargo":                        {"lat": 40.7329, "lon": -73.9891},
    "Airport Security":                 {"lat": 40.7320, "lon": -73.9893},
    "Central Finance & Tech Hub":       {"lat": 40.7311, "lon": -73.9952},
    "Central Union Government House":   {"lat": 40.7306, "lon": -73.9915},
    "City Museum":                      {"lat": 40.7308, "lon": -73.9892},
    "Street Distro":                    {"lat": 40.7296, "lon": -73.9993},
    "Local Cafe":                       {"lat": 40.7296, "lon": -73.9980},
    "Post Office":                      {"lat": 40.7287, "lon": -74.0006},
    "Local Food & Commerce":            {"lat": 40.7287, "lon": -73.9987},
    "Bakery":                           {"lat": 40.7282, "lon": -73.9991},
    "Artisan Shop":                     {"lat": 40.7282, "lon": -73.9978},
    "Urban Farm":                       {"lat": 40.7283, "lon": -73.9955},
    "Elementary School":                {"lat": 40.7277, "lon": -73.9943},
    "School Campus":                    {"lat": 40.7264, "lon": -73.9941},
    "Housing Apartments":               {"lat": 40.7264, "lon": -73.9913},
    "Bike Storage":                     {"lat": 40.7256, "lon": -73.9905},
    "Leasing Office":                   {"lat": 40.7254, "lon": -73.9918},
    "Laundromat":                       {"lat": 40.7253, "lon": -73.9910},
    "Mail Room":                        {"lat": 40.7253, "lon": -73.9903},
    "Community Sports & OVH Complex":  {"lat": 40.7252, "lon": -73.9889},
    "Police Station":                   {"lat": 40.7268, "lon": -73.9887},
}

POI_NAMES = list(POIS.keys())

ALL_LOCATIONS = {"home": None, "work": None, **POIS}

NEIGHBORHOOD_DESCRIPTION = """
You live in a mid-sized city with the following layout — know these locations by name:

STREETS (grid):
- Street A: main vertical artery on the far west side, lined with Residential Housing blocks
- Street B: vertical street just east of Street A, runs past the Central Finance & Tech Hub
- Street F: major horizontal road in the upper district, commercial corridor
- Street S: horizontal street through the mid-city commercial zone (Bakery, Artisan Shop, Local Food & Commerce, Post Office)
- Street I: horizontal street in the lower residential district
- Street J: horizontal road through the lower-right apartment zone (Housing Apartments)
- Street K: the southernmost horizontal road along the bottom edge

LANDMARKS (north to south, west to east):
- City Harbor Park & Russell Gates: waterfront park in the northwest with sailing boats; locals walk here mornings
- Botanic Gardens & Garden Gates: lush green space in the north-center; popular with families and students
- Park: open green area in the north-east near the water
- City International Airport & Air Cargo: northeast corner; Air Cargo dock is just south of the terminal; Airport Security checkpoint controls access
- Central Finance & Tech Hub: the dominant glass skyscraper in the city center on Street B; home to banks, startups, and tech offices
- Central Union Government House: grand civic building east of center; city council, planning dept, mayor's office
- City Museum: large institution on the eastern side near the Government House
- Street Distro & Local Cafe: small eatery and cafe on Street A/F junction; neighborhood gathering spots
- Post Office: far-west anchor of Street S
- Local Food & Commerce: mid-block market on Street S
- Bakery & Artisan Shop: side-by-side on Street S, the social heart of the commercial strip
- Urban Farm: community growing space between Street B and Street S, just south of the Tech Hub
- Elementary School: brick schoolhouse just below Street I near Street B
- School Campus: large secondary school and playing fields south of the Elementary School
- Housing Apartments, Lobby, Leasing Office, Laundromat, Mail Room, Bike Storage: apartment complex cluster in the southeast near Street J
- Police Station: far east, south of Street J
- Community Sports & OVH Complex: far southeast corner; soccer pitches, courts, gym
""".strip()
