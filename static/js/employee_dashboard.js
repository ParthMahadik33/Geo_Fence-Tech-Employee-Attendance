// Employee Dashboard JavaScript

// Geofence configuration (will be loaded from server)
let GEOFENCE_CONFIG = {
    latitude: 28.7041,  // Default: Delhi coordinates
    longitude: 77.1025,
    radius: 100  // radius in meters
};

let checkInTime = null;
let checkOutTime = null;
let locationWatchId = null;
let deviceRegistered = false;
let deviceApproved = false;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Check if employee is logged in
    const employeeId = sessionStorage.getItem('employeeId');
    const employeeName = sessionStorage.getItem('employeeName');
    
    if (!employeeId) {
        window.location.href = '/employee/login';
        return;
    }
    
    // Set employee name
    if (employeeName) {
        document.getElementById('employeeName').textContent = employeeName;
    }
    
    // Load device status and geofence config first
    loadDeviceStatus();
    loadGeofenceConfig();
    
    // Load today's attendance
    loadAttendance();
});

// Load device status
function loadDeviceStatus() {
    fetch('/employee/device-status')
        .then(response => response.json())
        .then(data => {
            const deviceStatusEl = document.getElementById('deviceStatus');
            const registerDeviceBtn = document.getElementById('registerDeviceBtn');
            
            if (data.success) {
                deviceRegistered = !!data.deviceId;
                deviceApproved = data.deviceApproved;
                
                if (deviceRegistered && deviceApproved) {
                    deviceStatusEl.textContent = `✓ Device Registered: ${data.deviceId}`;
                    deviceStatusEl.style.color = '#38a169';
                    registerDeviceBtn.style.display = 'none';
                    // Start location monitoring once device is registered
                    checkLocation();
                    startLocationMonitoring();
                } else if (deviceRegistered && !deviceApproved) {
                    deviceStatusEl.textContent = '⏳ Device registration pending admin approval';
                    deviceStatusEl.style.color = '#d69e2e';
                    registerDeviceBtn.style.display = 'none';
                } else {
                    deviceStatusEl.textContent = '✗ No device registered. Please register your device.';
                    deviceStatusEl.style.color = '#e53e3e';
                    registerDeviceBtn.style.display = 'inline-block';
                }
            } else {
                deviceStatusEl.textContent = '✗ Error checking device status';
                deviceStatusEl.style.color = '#e53e3e';
                registerDeviceBtn.style.display = 'inline-block';
            }
        })
        .catch(error => {
            console.error('Error loading device status:', error);
            const deviceStatusEl = document.getElementById('deviceStatus');
            deviceStatusEl.textContent = '✗ Error checking device status';
            deviceStatusEl.style.color = '#e53e3e';
        });
}

// Load geofence configuration from server
function loadGeofenceConfig() {
    fetch('/employee/geofence-config')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.config) {
                GEOFENCE_CONFIG = data.config;
                // If device is already registered, start checking location
                if (deviceRegistered && deviceApproved) {
                    checkLocation();
                }
            }
        })
        .catch(error => {
            console.error('Error loading geofence config:', error);
        });
}

// Check if user is inside geofence
function checkLocation() {
    // Only check location if device is registered and approved
    if (!deviceRegistered || !deviceApproved) {
        const statusText = document.getElementById('locationStatus');
        const statusIndicator = document.getElementById('statusIndicator');
        const checkInBtn = document.getElementById('checkInBtn');
        
        statusText.textContent = 'Please register and get your device approved to check in';
        statusText.style.color = '#e53e3e';
        statusIndicator.className = 'status-indicator inactive';
        checkInBtn.disabled = true;
        return;
    }
    
    const statusText = document.getElementById('locationStatus');
    const statusIndicator = document.getElementById('statusIndicator');
    const checkInBtn = document.getElementById('checkInBtn');
    const checkOutBtn = document.getElementById('checkOutBtn');
    
    statusText.textContent = 'Checking your location...';
    statusIndicator.className = 'status-indicator';
    
    if (!navigator.geolocation) {
        statusText.textContent = 'Geolocation is not supported by your browser';
        statusText.style.color = '#e53e3e';
        statusIndicator.className = 'status-indicator inactive';
        checkInBtn.disabled = true;
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const userLat = position.coords.latitude;
            const userLon = position.coords.longitude;
            
            // Calculate distance from geofence center
            const distance = calculateDistance(
                GEOFENCE_CONFIG.latitude,
                GEOFENCE_CONFIG.longitude,
                userLat,
                userLon
            );
            
            if (distance <= GEOFENCE_CONFIG.radius) {
                // Inside geofence
                statusText.textContent = `✓ You are inside the geofence area (${Math.round(distance)}m from center)`;
                statusText.style.color = '#38a169';
                statusIndicator.className = 'status-indicator active';
                // Only enable check-in if device is registered and approved
                checkInBtn.disabled = !(deviceRegistered && deviceApproved);
            } else {
                // Outside geofence
                statusText.textContent = `✗ You are outside the geofence area (${Math.round(distance)}m from center)`;
                statusText.style.color = '#e53e3e';
                statusIndicator.className = 'status-indicator inactive';
                checkInBtn.disabled = true;
            }
        },
        function(error) {
            statusText.textContent = 'Unable to retrieve your location. Please enable location services.';
            statusText.style.color = '#e53e3e';
            statusIndicator.className = 'status-indicator inactive';
            checkInBtn.disabled = true;
            console.error('Geolocation error:', error);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// Start continuous location monitoring
function startLocationMonitoring() {
    // Check location every 30 seconds
    locationWatchId = setInterval(checkLocation, 30000);
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Check in function
function checkIn() {
    const checkInBtn = document.getElementById('checkInBtn');
    const checkOutBtn = document.getElementById('checkOutBtn');
    
    // Verify device is registered and approved
    if (!deviceRegistered || !deviceApproved) {
        alert('Please register and get your device approved before checking in');
        return;
    }
    
    if (checkInBtn.disabled) {
        alert('You must be inside the geofence area to check in');
        return;
    }
    
    // Get current location
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const userLat = position.coords.latitude;
            const userLon = position.coords.longitude;
            
            // Verify user is still within geofence
            const distance = calculateDistance(
                GEOFENCE_CONFIG.latitude,
                GEOFENCE_CONFIG.longitude,
                userLat,
                userLon
            );
            
            if (distance > GEOFENCE_CONFIG.radius) {
                alert('You are outside the geofence area. Please move within the geofence to check in.');
                checkLocation(); // Update UI
                return;
            }
            
            const employeeId = sessionStorage.getItem('employeeId');
            const checkInData = {
                employeeId: employeeId,
                latitude: userLat,
                longitude: userLon,
                timestamp: new Date().toISOString()
            };
            
            // Send check-in to server
            fetch('/employee/checkin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(checkInData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    checkInTime = new Date();
                    document.getElementById('checkInTime').textContent = checkInTime.toLocaleTimeString();
                    document.getElementById('attendanceInfo').style.display = 'block';
                    checkInBtn.disabled = true;
                    checkOutBtn.disabled = false;
                    alert('Check-in successful!');
                } else {
                    alert(data.message || 'Check-in failed. Please try again.');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Check-in failed. Please try again.');
            });
        },
        function(error) {
            alert('Unable to get your location for check-in');
            console.error('Geolocation error:', error);
        }
    );
}

// Check out function (currently not functional as per requirements)
function checkOut() {
    alert('Check-out functionality will be implemented later');
    // Will be implemented later
}

// Register device function
function registerDevice() {
    const employeeId = sessionStorage.getItem('employeeId');
    
    if (!employeeId) {
        alert('Please log in to register your device');
        return;
    }
    
    // Get device information
    const deviceInfo = {
        employeeId: employeeId,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        timestamp: new Date().toISOString()
    };
    
    // Send device registration request
    fetch('/employee/register-device', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(deviceInfo)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Device registration request submitted. Waiting for admin approval.');
            // Reload device status
            loadDeviceStatus();
        } else {
            alert(data.message || 'Device registration failed. Please try again.');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error submitting device registration. Please try again.');
    });
}

// Load today's attendance
function loadAttendance() {
    const employeeId = sessionStorage.getItem('employeeId');
    
    fetch(`/employee/attendance/${employeeId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.attendance) {
                if (data.attendance.checkIn) {
                    checkInTime = new Date(data.attendance.checkIn);
                    document.getElementById('checkInTime').textContent = checkInTime.toLocaleTimeString();
                    document.getElementById('checkInBtn').disabled = true;
                }
                if (data.attendance.checkOut) {
                    checkOutTime = new Date(data.attendance.checkOut);
                    document.getElementById('checkOutTime').textContent = checkOutTime.toLocaleTimeString();
                }
                if (checkInTime) {
                    document.getElementById('attendanceInfo').style.display = 'block';
                    document.getElementById('checkOutBtn').disabled = false;
                }
            }
        })
        .catch(error => {
            console.error('Error loading attendance:', error);
        });
}

// Logout function
function logout() {
    if (locationWatchId) {
        clearInterval(locationWatchId);
    }
    sessionStorage.clear();
    window.location.href = '/';
}


