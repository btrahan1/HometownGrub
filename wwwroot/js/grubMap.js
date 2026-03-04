window.grubMap = {
    map: null,
    markers: [],

    initMap: function (containerId) {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }

        // Show a loading state if appropriate
        console.log("Requesting geolocation...");

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                this.renderMap(containerId, lat, lon);
            },
            (error) => {
                console.error("Geolocation error:", error);
                alert("Could not get your location. Please ensure location permissions are granted.");
            }
        );
    },

    renderMap: function (containerId, lat, lon) {
        // Clean up existing map if opening multiple times
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        this.map = L.map(containerId).setView([lat, lon], 13);

        // Add free OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);

        // Add a distinct red circle marker for the user
        L.circleMarker([lat, lon], {
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.8,
            radius: 8
        }).addTo(this.map)
            .bindPopup("<b>You are here!</b>").openPopup();

        // 10 miles is ~16000 meters
        this.fetchNearbyRestaurants(lat, lon, 16000);
    },

    fetchNearbyRestaurants: async function (lat, lon, radiusMeters) {
        // Use the Overpass API to find all "amenity=restaurant" nodes within the radius
        const overpassUrl = 'https://overpass-api.de/api/interpreter';

        // This query finds nodes within radius from the center for multiple food amenity types
        const query = `
            [out:json][timeout:25];
            (
              node["amenity"~"restaurant|fast_food|cafe|pub"](around:${radiusMeters},${lat},${lon});
              way["amenity"~"restaurant|fast_food|cafe|pub"](around:${radiusMeters},${lat},${lon});
              relation["amenity"~"restaurant|fast_food|cafe|pub"](around:${radiusMeters},${lat},${lon});
            );
            out center;
        `;

        try {
            const response = await fetch(overpassUrl, {
                method: 'POST',
                body: query
            });
            const data = await response.json();

            if (data.elements && data.elements.length > 0) {
                this.plotRestaurants(data.elements);
            } else {
                console.log("No restaurants found within radius.");
            }
        } catch (error) {
            console.error("Error fetching from Overpass API:", error);
        }
    },

    plotRestaurants: function (elements) {
        elements.forEach(el => {
            // Overpass ways/relations might have center coordinates instead of direct lat/lon
            const lat = el.lat || (el.center && el.center.lat);
            const lon = el.lon || (el.center && el.center.lon);
            const name = el.tags && el.tags.name ? el.tags.name : "Unnamed Restaurant";

            if (lat && lon) {
                L.marker([lat, lon]).addTo(this.map)
                    .bindPopup(`<b>${name}</b>`);
            }
        });
    }
};
