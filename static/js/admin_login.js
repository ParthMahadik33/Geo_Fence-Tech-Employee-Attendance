// Admin Login JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    
    loginForm.addEventListener('submit', function(event) {
        event.preventDefault();
        
        const adminId = document.getElementById('adminId').value;
        const password = document.getElementById('adminPassword').value;
        
        // Basic validation
        if (!adminId || !password) {
            alert('Please fill in all fields');
            return;
        }
        
        // Send login request to server
        fetch('/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                adminId: adminId,
                password: password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Store admin info in sessionStorage
                sessionStorage.setItem('adminId', data.adminId);
                sessionStorage.setItem('adminName', data.adminName || 'Admin');
                // Redirect to dashboard
                window.location.href = '/admin/dashboard';
            } else {
                alert(data.message || 'Login failed. Please check your credentials.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            // For development: allow login without backend
            sessionStorage.setItem('adminId', adminId);
            sessionStorage.setItem('adminName', 'Admin');
            window.location.href = '/admin/dashboard';
        });
    });
});


