// Admin Signup JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const signupForm = document.getElementById('signupForm');
    
    signupForm.addEventListener('submit', function(event) {
        event.preventDefault();
        
        const adminName = document.getElementById('adminName').value;
        const adminId = document.getElementById('adminId').value;
        const adminEmail = document.getElementById('adminEmail').value;
        const password = document.getElementById('adminPassword').value;
        const confirmPassword = document.getElementById('adminConfirmPassword').value;
        
        // Basic validation
        if (!adminName || !adminId || !adminEmail || !password || !confirmPassword) {
            alert('Please fill in all fields');
            return;
        }
        
        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        
        if (password.length < 6) {
            alert('Password must be at least 6 characters long');
            return;
        }
        
        // Send signup request to server
        fetch('/admin/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                adminName: adminName,
                adminId: adminId,
                adminEmail: adminEmail,
                password: password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Registration successful! Please login.');
                window.location.href = '/admin/login';
            } else {
                alert(data.message || 'Registration failed. Please try again.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Registration successful! Please login.');
            window.location.href = '/admin/login';
        });
    });
});




