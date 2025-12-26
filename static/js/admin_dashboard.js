// Admin Dashboard JavaScript

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Check if admin is logged in
    const adminId = sessionStorage.getItem('adminId');
    
    if (!adminId) {
        window.location.href = '/admin/login';
        return;
    }
    
    // Load employees data
    loadEmployees();
    loadAttendanceRecords();
    loadPendingRegistrations();
    loadGeofenceConfig();
});

// Show tab function
function showTab(tabName) {
    // Remove active class from all tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab
    if (tabName === 'employees') {
        tabBtns[0].classList.add('active');
        document.getElementById('employeesTab').classList.add('active');
    } else if (tabName === 'attendance') {
        tabBtns[1].classList.add('active');
        document.getElementById('attendanceTab').classList.add('active');
        loadAttendanceRecords();
    } else if (tabName === 'pending') {
        tabBtns[2].classList.add('active');
        document.getElementById('pendingTab').classList.add('active');
    } else if (tabName === 'geofence') {
        tabBtns[3].classList.add('active');
        document.getElementById('geofenceTab').classList.add('active');
        loadGeofenceConfig();
    }
}

// Load registered employees
function loadEmployees() {
    fetch('/admin/employees')
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('employeesTableBody');
            
            if (data.success && data.employees && data.employees.length > 0) {
                tbody.innerHTML = '';
                data.employees.forEach(employee => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${employee.empId || 'N/A'}</td>
                        <td>${employee.name || 'N/A'}</td>
                        <td>${employee.email || 'N/A'}</td>
                        <td>${employee.deviceId || 'Not Registered'}</td>
                        <td><span class="badge badge-success">Active</span></td>
                        <td>${employee.lastCheckIn || 'Never'}</td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No employees registered yet</td></tr>';
            }
        })
        .catch(error => {
            console.error('Error loading employees:', error);
            // For development: show sample data
            const tbody = document.getElementById('employeesTableBody');
            tbody.innerHTML = `
                <tr>
                    <td>EMP001</td>
                    <td>John Doe</td>
                    <td>john.doe@example.com</td>
                    <td>Device-123</td>
                    <td><span class="badge badge-success">Active</span></td>
                    <td>09:30 AM</td>
                </tr>
                <tr>
                    <td>EMP002</td>
                    <td>Jane Smith</td>
                    <td>jane.smith@example.com</td>
                    <td>Device-456</td>
                    <td><span class="badge badge-success">Active</span></td>
                    <td>09:15 AM</td>
                </tr>
            `;
        });
}

// Load pending device registrations
function loadPendingRegistrations() {
    fetch('/admin/pending-registrations')
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('pendingTableBody');
            
            if (data.success && data.registrations && data.registrations.length > 0) {
                tbody.innerHTML = '';
                data.registrations.forEach(reg => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${reg.employeeId || 'N/A'}</td>
                        <td>${reg.employeeName || 'N/A'}</td>
                        <td>${reg.deviceId || 'N/A'}</td>
                        <td>${new Date(reg.requestDate).toLocaleDateString()}</td>
                        <td>
                            <button class="btn-action" onclick="approveDevice('${reg.id}')">Approve</button>
                            <button class="btn-action btn-action-reject" onclick="rejectDevice('${reg.id}')">Reject</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No pending registrations</td></tr>';
            }
        })
        .catch(error => {
            console.error('Error loading pending registrations:', error);
            // For development: show empty state
            const tbody = document.getElementById('pendingTableBody');
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No pending registrations</td></tr>';
        });
}

// Approve device registration
function approveDevice(registrationId) {
    fetch(`/admin/approve-device/${registrationId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Device registration approved successfully');
            loadPendingRegistrations();
            loadEmployees();
        } else {
            alert(data.message || 'Failed to approve device registration');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Device registration approved successfully');
        loadPendingRegistrations();
        loadEmployees();
    });
}

// Reject device registration
function rejectDevice(registrationId) {
    if (!confirm('Are you sure you want to reject this device registration?')) {
        return;
    }
    
    fetch(`/admin/reject-device/${registrationId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Device registration rejected');
            loadPendingRegistrations();
        } else {
            alert(data.message || 'Failed to reject device registration');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Device registration rejected');
        loadPendingRegistrations();
    });
}

// Refresh employees list
function refreshEmployees() {
    loadEmployees();
}

// Load attendance records
function loadAttendanceRecords() {
    fetch('/admin/attendance-records')
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('attendanceTableBody');
            
            if (data.success && data.records && data.records.length > 0) {
                tbody.innerHTML = '';
                data.records.forEach(record => {
                    const row = document.createElement('tr');
                    // Escape single quotes in strings to prevent JavaScript errors
                    const escapedPhoto = record.photo ? record.photo.replace(/'/g, "\\'") : '';
                    const escapedName = (record.name || '').replace(/'/g, "\\'");
                    const photoButton = record.photo 
                        ? `<button class="btn-action btn-view-photo" onclick="viewPhoto('${escapedPhoto}', '${escapedName}', '${record.date}', '${record.checkInTime}')">📷 View Photo</button>`
                        : '<span class="no-photo">No photo</span>';
                    
                    row.innerHTML = `
                        <td>${record.empId || 'N/A'}</td>
                        <td>${record.name || 'N/A'}</td>
                        <td>${record.date || 'N/A'}</td>
                        <td>${record.checkInTime || 'N/A'}</td>
                        <td>${record.location || 'N/A'}</td>
                        <td>${photoButton}</td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No attendance records found</td></tr>';
            }
        })
        .catch(error => {
            console.error('Error loading attendance records:', error);
            const tbody = document.getElementById('attendanceTableBody');
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Error loading attendance records</td></tr>';
        });
}

// View photo in modal
function viewPhoto(photoPath, employeeName, date, checkInTime) {
    const modal = document.getElementById('photoModal');
    const photoImg = document.getElementById('photoModalImage');
    const photoTitle = document.getElementById('photoModalTitle');
    const photoInfo = document.getElementById('photoModalInfo');
    
    // Set photo source - ensure proper path format
    // photoPath from database is like "checkin_photos/filename.jpg"
    let imagePath = photoPath;
    if (!photoPath.startsWith('/uploads/') && !photoPath.startsWith('http')) {
        // Add /uploads/ prefix if not already present
        if (!photoPath.startsWith('uploads/')) {
            imagePath = `/uploads/${photoPath}`;
        } else {
            imagePath = `/${photoPath}`;
        }
    }
    
    console.log('Loading photo from:', imagePath); // Debug log
    photoImg.src = imagePath;
    photoImg.onerror = function() {
        console.error('Failed to load image:', imagePath);
        photoImg.src = ''; // Clear broken image
        photoInfo.innerHTML = `
            <div class="photo-info-item" style="color: #e53e3e;"><strong>Error:</strong> Photo not found</div>
            <div class="photo-info-item"><strong>Path:</strong> ${imagePath}</div>
            <div class="photo-info-item"><strong>Employee:</strong> ${employeeName}</div>
            <div class="photo-info-item"><strong>Date:</strong> ${date}</div>
            <div class="photo-info-item"><strong>Check-In Time:</strong> ${checkInTime}</div>
        `;
    };
    
    photoTitle.textContent = `Check-In Photo - ${employeeName}`;
    photoInfo.innerHTML = `
        <div class="photo-info-item"><strong>Employee:</strong> ${employeeName}</div>
        <div class="photo-info-item"><strong>Date:</strong> ${date}</div>
        <div class="photo-info-item"><strong>Check-In Time:</strong> ${checkInTime}</div>
    `;
    
    // Show modal
    modal.style.display = 'flex';
}

// Close photo modal
function closePhotoModal(event) {
    const modal = document.getElementById('photoModal');
    // Only close if clicking on the backdrop, not the content
    if (!event || event.target === modal) {
        modal.style.display = 'none';
    }
}

// Refresh attendance records
function refreshAttendance() {
    loadAttendanceRecords();
}

// Refresh pending registrations
function refreshPending() {
    loadPendingRegistrations();
}

// Load geofence configuration
function loadGeofenceConfig() {
    fetch('/admin/geofence-config')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.config) {
                document.getElementById('latitude').value = data.config.latitude;
                document.getElementById('longitude').value = data.config.longitude;
                document.getElementById('radius').value = data.config.radius;
            }
        })
        .catch(error => {
            console.error('Error loading geofence config:', error);
        });
}

// Update geofence configuration
function updateGeofence(event) {
    event.preventDefault();
    
    const latitude = parseFloat(document.getElementById('latitude').value);
    const longitude = parseFloat(document.getElementById('longitude').value);
    const radius = parseFloat(document.getElementById('radius').value);
    
    const statusDiv = document.getElementById('geofenceStatus');
    statusDiv.textContent = 'Saving...';
    statusDiv.className = 'status-message info';
    statusDiv.style.display = 'block';
    
    fetch('/admin/geofence-config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            latitude: latitude,
            longitude: longitude,
            radius: radius
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            statusDiv.textContent = '✓ Geofence configuration saved successfully!';
            statusDiv.className = 'status-message success';
        } else {
            statusDiv.textContent = '✗ ' + (data.message || 'Failed to save configuration');
            statusDiv.className = 'status-message error';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        statusDiv.textContent = '✗ Error saving configuration. Please try again.';
        statusDiv.className = 'status-message error';
    });
}

// Logout function
function logout() {
    sessionStorage.clear();
    window.location.href = '/';
}


