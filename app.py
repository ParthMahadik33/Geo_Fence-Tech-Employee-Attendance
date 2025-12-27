from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
from datetime import datetime
import json
import os
import sqlite3
from contextlib import closing
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-this-in-production'

# Database configuration
DATABASE = 'attendance.db'

# Geofence configuration (default values)
GEOFENCE_CONFIG = {
    'latitude': 28.7041,  # Example: Delhi coordinates
    'longitude': 77.1025,
    'radius': 100  # radius in meters
}

# Database helper functions
def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database with required tables"""
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        
        # Create employees table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS employees (
                emp_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                password TEXT NOT NULL,
                device_id TEXT,
                device_approved INTEGER DEFAULT 0,
                device_fingerprint TEXT
            )
        ''')
        
        # Add device_fingerprint column if it doesn't exist (for existing databases)
        try:
            cursor.execute('ALTER TABLE employees ADD COLUMN device_fingerprint TEXT')
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        # Create admins table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS admins (
                admin_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                password TEXT NOT NULL
            )
        ''')
        
        # Create device_registrations table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS device_registrations (
                reg_id TEXT PRIMARY KEY,
                employee_id TEXT NOT NULL,
                employee_name TEXT NOT NULL,
                device_id TEXT NOT NULL,
                device_fingerprint TEXT NOT NULL,
                request_date TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                FOREIGN KEY (employee_id) REFERENCES employees(emp_id)
            )
        ''')
        
        # Add device_fingerprint column if it doesn't exist (for existing databases)
        try:
            cursor.execute('ALTER TABLE device_registrations ADD COLUMN device_fingerprint TEXT')
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        # Create attendance_records table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS attendance_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                emp_id TEXT NOT NULL,
                date TEXT NOT NULL,
                check_in TEXT,
                check_in_lat REAL,
                check_in_lon REAL,
                check_in_photo TEXT,
                check_out TEXT,
                check_out_lat REAL,
                check_out_lon REAL,
                FOREIGN KEY (emp_id) REFERENCES employees(emp_id),
                UNIQUE(emp_id, date)
            )
        ''')
        
        # Add check_in_photo column if it doesn't exist (for existing databases)
        try:
            cursor.execute('ALTER TABLE attendance_records ADD COLUMN check_in_photo TEXT')
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        # Create geofence_config table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS geofence_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                radius REAL NOT NULL
            )
        ''')
        
        # Insert default geofence config if not exists
        cursor.execute('SELECT COUNT(*) FROM geofence_config')
        if cursor.fetchone()[0] == 0:
            cursor.execute('''
                INSERT INTO geofence_config (latitude, longitude, radius)
                VALUES (?, ?, ?)
            ''', (GEOFENCE_CONFIG['latitude'], GEOFENCE_CONFIG['longitude'], GEOFENCE_CONFIG['radius']))
        
        conn.commit()

# Initialize database on startup
init_db()

# Routes
@app.route('/')
def index():
    return render_template('index.html')

# Employee Routes
@app.route('/employee/login', methods=['GET'])
def employee_login():
    return render_template('employee_login.html')

@app.route('/employee/login', methods=['POST'])
def employee_login_post():
    data = request.get_json()
    emp_id = data.get('empId')
    password = data.get('password')
    device_fingerprint = data.get('deviceFingerprint')
    
    # Check if employee exists and password matches
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT emp_id, name, password, device_approved, device_fingerprint FROM employees WHERE emp_id = ?', (emp_id,))
        employee = cursor.fetchone()
        
        if not employee or employee['password'] != password:
            return jsonify({
                'success': False,
                'message': 'Invalid credentials'
            }), 401
        
        # Verify device fingerprint if device is approved
        if employee['device_approved'] and employee['device_fingerprint']:
            if not device_fingerprint:
                return jsonify({
                    'success': False,
                    'message': 'Device fingerprint required. Please register your device first.'
                }), 403
            
            if device_fingerprint != employee['device_fingerprint']:
                return jsonify({
                    'success': False,
                    'message': 'Device mismatch detected. This device is not registered for this employee. Please use your registered device or contact admin.'
                }), 403
        
        session['employee_id'] = emp_id
        session['employee_name'] = employee['name']
        return jsonify({
            'success': True,
            'employeeId': emp_id,
            'employeeName': employee['name']
        })

@app.route('/employee/signup', methods=['GET'])
def employee_signup():
    return render_template('employee_signup.html')

@app.route('/employee/signup', methods=['POST'])
def employee_signup_post():
    data = request.get_json()
    emp_id = data.get('empId')
    emp_name = data.get('empName')
    emp_email = data.get('empEmail')
    password = data.get('password')
    
    # Check if employee already exists
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT emp_id FROM employees WHERE emp_id = ?', (emp_id,))
        if cursor.fetchone():
            return jsonify({
                'success': False,
                'message': 'Employee ID already exists'
            }), 400
        
        # Create new employee
        cursor.execute('''
            INSERT INTO employees (emp_id, name, email, password, device_id, device_approved)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (emp_id, emp_name, emp_email, password, None, 0))
        conn.commit()
    
    return jsonify({
        'success': True,
        'message': 'Registration successful'
    })

@app.route('/employee/dashboard')
def employee_dashboard():
    # Check if employee is logged in
    if 'employee_id' not in session:
        return redirect(url_for('employee_login'))
    return render_template('employee_dashboard.html')

@app.route('/employee/checkin', methods=['POST'])
def employee_checkin():
    # Check if request contains file (photo) or JSON
    if 'photo' in request.files:
        # Handle photo upload
        emp_id = request.form.get('employeeId')
        timestamp = request.form.get('timestamp')
        latitude = request.form.get('latitude')
        longitude = request.form.get('longitude')
        device_fingerprint = request.form.get('deviceFingerprint')
        photo_file = request.files['photo']
        
        if not emp_id:
            return jsonify({
                'success': False,
                'message': 'Employee ID is required'
            }), 400
        
        # Verify device fingerprint
        with closing(get_db()) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT device_approved, device_fingerprint FROM employees WHERE emp_id = ?', (emp_id,))
            employee = cursor.fetchone()
            
            if employee and employee['device_approved'] and employee['device_fingerprint']:
                if not device_fingerprint:
                    return jsonify({
                        'success': False,
                        'message': 'Device fingerprint required for check-in'
                    }), 403
                
                if device_fingerprint != employee['device_fingerprint']:
                    return jsonify({
                        'success': False,
                        'message': 'Device mismatch detected. Check-in denied. Please use your registered device.'
                    }), 403
        
        # Create uploads directory if it doesn't exist
        upload_dir = os.path.join('static', 'uploads', 'checkin_photos')
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        today = datetime.now().strftime('%Y-%m-%d')
        filename = f"{emp_id}_{today}_{datetime.now().strftime('%H%M%S')}.jpg"
        filename = secure_filename(filename)
        photo_path = os.path.join(upload_dir, filename)
        
        # Save photo
        photo_file.save(photo_path)
        
        # Store relative path for web access (without leading slash)
        photo_relative_path = os.path.join('checkin_photos', filename).replace('\\', '/')
        
        # Use server timestamp for accuracy (more reliable than client timestamp)
        server_timestamp = datetime.now().isoformat()
        
        # Store check-in record with photo
        with closing(get_db()) as conn:
            cursor = conn.cursor()
            # Check if record exists for today
            cursor.execute('SELECT id FROM attendance_records WHERE emp_id = ? AND date = ?', (emp_id, today))
            existing = cursor.fetchone()
            
            if existing:
                # Update existing record
                cursor.execute('''
                    UPDATE attendance_records 
                    SET check_in = ?, check_in_lat = ?, check_in_lon = ?, check_in_photo = ?
                    WHERE emp_id = ? AND date = ?
                ''', (server_timestamp, latitude, longitude, photo_relative_path, emp_id, today))
            else:
                # Insert new record
                cursor.execute('''
                    INSERT INTO attendance_records (emp_id, date, check_in, check_in_lat, check_in_lon, check_in_photo)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (emp_id, today, server_timestamp, latitude, longitude, photo_relative_path))
            conn.commit()
        
        return jsonify({
            'success': True,
            'message': 'Check-in recorded successfully with photo',
            'timestamp': server_timestamp  # Return server timestamp for accurate display
        })
    else:
        # Handle JSON request (backward compatibility)
        data = request.get_json()
        emp_id = data.get('employeeId')
        device_fingerprint = data.get('deviceFingerprint')
        
        # Verify device fingerprint
        with closing(get_db()) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT device_approved, device_fingerprint FROM employees WHERE emp_id = ?', (emp_id,))
            employee = cursor.fetchone()
            
            if employee and employee['device_approved'] and employee['device_fingerprint']:
                if not device_fingerprint:
                    return jsonify({
                        'success': False,
                        'message': 'Device fingerprint required for check-in'
                    }), 403
                
                if device_fingerprint != employee['device_fingerprint']:
                    return jsonify({
                        'success': False,
                        'message': 'Device mismatch detected. Check-in denied. Please use your registered device.'
                    }), 403
        
        # Store check-in record
        today = datetime.now().strftime('%Y-%m-%d')
        # Use server timestamp for accuracy
        server_timestamp = datetime.now().isoformat()
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        
        with closing(get_db()) as conn:
            cursor = conn.cursor()
            # Check if record exists for today
            cursor.execute('SELECT id FROM attendance_records WHERE emp_id = ? AND date = ?', (emp_id, today))
            existing = cursor.fetchone()
            
            if existing:
                # Update existing record
                cursor.execute('''
                    UPDATE attendance_records 
                    SET check_in = ?, check_in_lat = ?, check_in_lon = ?
                    WHERE emp_id = ? AND date = ?
                ''', (server_timestamp, latitude, longitude, emp_id, today))
            else:
                # Insert new record
                cursor.execute('''
                    INSERT INTO attendance_records (emp_id, date, check_in, check_in_lat, check_in_lon)
                    VALUES (?, ?, ?, ?, ?)
                ''', (emp_id, today, server_timestamp, latitude, longitude))
            conn.commit()
        
        return jsonify({
            'success': True,
            'message': 'Check-in recorded successfully',
            'timestamp': server_timestamp  # Return server timestamp for accurate display
        })

@app.route('/employee/checkout', methods=['POST'])
def employee_checkout():
    data = request.get_json()
    emp_id = data.get('employeeId')
    device_fingerprint = data.get('deviceFingerprint')
    
    if not emp_id:
        return jsonify({
            'success': False,
            'message': 'Employee ID is required'
        }), 400
    
    # Verify device fingerprint
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT device_approved, device_fingerprint FROM employees WHERE emp_id = ?', (emp_id,))
        employee = cursor.fetchone()
        
        if employee and employee['device_approved'] and employee['device_fingerprint']:
            if not device_fingerprint:
                return jsonify({
                    'success': False,
                    'message': 'Device fingerprint required for check-out'
                }), 403
            
            if device_fingerprint != employee['device_fingerprint']:
                return jsonify({
                    'success': False,
                    'message': 'Device mismatch detected. Check-out denied. Please use your registered device.'
                }), 403
        
        # Check if employee has checked in today
        today = datetime.now().strftime('%Y-%m-%d')
        cursor.execute('SELECT id, check_in FROM attendance_records WHERE emp_id = ? AND date = ?', (emp_id, today))
        record = cursor.fetchone()
        
        if not record or not record['check_in']:
            return jsonify({
                'success': False,
                'message': 'You must check in first before checking out'
            }), 400
        
        # Check if already checked out
        cursor.execute('SELECT check_out FROM attendance_records WHERE emp_id = ? AND date = ?', (emp_id, today))
        existing_checkout = cursor.fetchone()
        if existing_checkout and existing_checkout['check_out']:
            return jsonify({
                'success': False,
                'message': 'You have already checked out today'
            }), 400
        
        # Use server timestamp for accuracy
        server_timestamp = datetime.now().isoformat()
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        
        # Update attendance record with check-out
        cursor.execute('''
            UPDATE attendance_records 
            SET check_out = ?, check_out_lat = ?, check_out_lon = ?
            WHERE emp_id = ? AND date = ?
        ''', (server_timestamp, latitude, longitude, emp_id, today))
        conn.commit()
    
    return jsonify({
        'success': True,
        'message': 'Check-out recorded successfully',
        'timestamp': server_timestamp  # Return server timestamp for accurate display
    })

@app.route('/employee/register-device', methods=['POST'])
def employee_register_device():
    data = request.get_json()
    emp_id = data.get('employeeId')
    device_fingerprint = data.get('deviceFingerprint')
    
    if not device_fingerprint:
        return jsonify({
            'success': False,
            'message': 'Device fingerprint is required'
        }), 400
    
    # Generate device ID
    device_id = f"Device-{emp_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    # Store registration request
    reg_id = f"REG-{emp_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    request_date = datetime.now().isoformat()
    
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        # Get employee name
        cursor.execute('SELECT name FROM employees WHERE emp_id = ?', (emp_id,))
        employee = cursor.fetchone()
        employee_name = employee['name'] if employee else 'Unknown'
        
        # Insert registration request with fingerprint
        cursor.execute('''
            INSERT INTO device_registrations (reg_id, employee_id, employee_name, device_id, device_fingerprint, request_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (reg_id, emp_id, employee_name, device_id, device_fingerprint, request_date, 'pending'))
        conn.commit()
    
    return jsonify({
        'success': True,
        'message': 'Device registration request submitted',
        'registrationId': reg_id
    })

@app.route('/employee/attendance/<emp_id>')
def employee_attendance(emp_id):
    today = datetime.now().strftime('%Y-%m-%d')
    
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT check_in, check_in_lat, check_in_lon, check_out, check_out_lat, check_out_lon
            FROM attendance_records
            WHERE emp_id = ? AND date = ?
        ''', (emp_id, today))
        record = cursor.fetchone()
        
        if record and record['check_in']:
            attendance = {
                'checkIn': record['check_in'],
                'checkInLat': record['check_in_lat'],
                'checkInLon': record['check_in_lon']
            }
            if record['check_out']:
                attendance['checkOut'] = record['check_out']
                attendance['checkOutLat'] = record['check_out_lat']
                attendance['checkOutLon'] = record['check_out_lon']
            return jsonify({
                'success': True,
                'attendance': attendance
            })
        else:
            return jsonify({
                'success': True,
                'attendance': None
            })

# Admin Routes
@app.route('/admin/login', methods=['GET'])
def admin_login():
    return render_template('admin_login.html')

@app.route('/admin/login', methods=['POST'])
def admin_login_post():
    data = request.get_json()
    admin_id = data.get('adminId')
    password = data.get('password')
    
    # Check if admin exists and password matches
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT admin_id, name, password FROM admins WHERE admin_id = ?', (admin_id,))
        admin = cursor.fetchone()
        
        if admin and admin['password'] == password:
            session['admin_id'] = admin_id
            session['admin_name'] = admin['name']
            return jsonify({
                'success': True,
                'adminId': admin_id,
                'adminName': admin['name']
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Invalid credentials'
            }), 401

@app.route('/admin/signup', methods=['GET'])
def admin_signup():
    return render_template('admin_signup.html')

@app.route('/admin/signup', methods=['POST'])
def admin_signup_post():
    data = request.get_json()
    admin_id = data.get('adminId')
    admin_name = data.get('adminName')
    admin_email = data.get('adminEmail')
    password = data.get('password')
    
    # Check if admin already exists
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT admin_id FROM admins WHERE admin_id = ?', (admin_id,))
        if cursor.fetchone():
            return jsonify({
                'success': False,
                'message': 'Admin ID already exists'
            }), 400
        
        # Create new admin
        cursor.execute('''
            INSERT INTO admins (admin_id, name, email, password)
            VALUES (?, ?, ?, ?)
        ''', (admin_id, admin_name, admin_email, password))
        conn.commit()
    
    return jsonify({
        'success': True,
        'message': 'Registration successful'
    })

@app.route('/admin/dashboard')
def admin_dashboard():
    # Check if admin is logged in
    if 'admin_id' not in session:
        return redirect(url_for('admin_login'))
    return render_template('admin_dashboard.html')

@app.route('/admin/employees')
def admin_employees():
    # Get all employees with their data
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT e.emp_id, e.name, e.email, e.device_id,
                   MAX(a.check_in) as last_checkin
            FROM employees e
            LEFT JOIN attendance_records a ON e.emp_id = a.emp_id
            GROUP BY e.emp_id, e.name, e.email, e.device_id
            ORDER BY e.emp_id
        ''')
        employees_data = cursor.fetchall()
        
        employees_list = []
        for emp in employees_data:
            last_checkin = 'Never'
            if emp['last_checkin']:
                try:
                    checkin_time = datetime.fromisoformat(emp['last_checkin'])
                    last_checkin = checkin_time.strftime('%I:%M %p')
                except:
                    last_checkin = 'Never'
            
            employees_list.append({
                'empId': emp['emp_id'],
                'name': emp['name'],
                'email': emp['email'],
                'deviceId': emp['device_id'] if emp['device_id'] else 'Not Registered',
                'lastCheckIn': last_checkin
            })
    
    return jsonify({
        'success': True,
        'employees': employees_list
    })

@app.route('/admin/attendance-records')
def admin_attendance_records():
    """Get all attendance records with photos"""
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT a.emp_id, e.name, a.date, a.check_in, a.check_in_lat, a.check_in_lon, a.check_in_photo
            FROM attendance_records a
            JOIN employees e ON a.emp_id = e.emp_id
            WHERE a.check_in IS NOT NULL
            ORDER BY a.date DESC, a.check_in DESC
            LIMIT 100
        ''')
        records = cursor.fetchall()
        
        attendance_list = []
        for record in records:
            check_in_time = 'N/A'
            if record['check_in']:
                try:
                    checkin_datetime = datetime.fromisoformat(record['check_in'])
                    check_in_time = checkin_datetime.strftime('%I:%M:%S %p')
                except:
                    check_in_time = 'N/A'
            
            location = 'N/A'
            if record['check_in_lat'] and record['check_in_lon']:
                location = f"{record['check_in_lat']:.6f}, {record['check_in_lon']:.6f}"
            
            attendance_list.append({
                'empId': record['emp_id'],
                'name': record['name'],
                'date': record['date'],
                'checkInTime': check_in_time,
                'location': location,
                'photo': record['check_in_photo'] if record['check_in_photo'] else None
            })
    
    return jsonify({
        'success': True,
        'records': attendance_list
    })

@app.route('/uploads/<path:filename>')
def serve_photo(filename):
    """Serve uploaded photos from static/uploads directory"""
    try:
        # Handle subdirectory paths like 'checkin_photos/filename.jpg'
        upload_dir = os.path.join('static', 'uploads')
        # Normalize the path and ensure it's safe
        safe_path = os.path.normpath(filename).replace('\\', '/')
        # Prevent directory traversal
        if '..' in safe_path or safe_path.startswith('/'):
            return jsonify({'error': 'Invalid path'}), 400
        return send_from_directory(upload_dir, safe_path)
    except Exception as e:
        app.logger.error(f'Error serving photo {filename}: {str(e)}')
        return jsonify({'error': 'Photo not found', 'message': str(e)}), 404

@app.route('/admin/pending-registrations')
def admin_pending_registrations():
    # Get all pending device registrations
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT reg_id, employee_id, employee_name, device_id, request_date
            FROM device_registrations
            WHERE status = 'pending'
            ORDER BY request_date DESC
        ''')
        registrations = cursor.fetchall()
        
        pending = []
        for reg in registrations:
            pending.append({
                'id': reg['reg_id'],
                'employeeId': reg['employee_id'],
                'employeeName': reg['employee_name'],
                'deviceId': reg['device_id'],
                'requestDate': reg['request_date']
            })
    
    return jsonify({
        'success': True,
        'registrations': pending
    })

@app.route('/admin/approve-device/<reg_id>', methods=['POST'])
def admin_approve_device(reg_id):
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        # Check if registration exists and get fingerprint
        cursor.execute('SELECT employee_id, device_id, device_fingerprint FROM device_registrations WHERE reg_id = ?', (reg_id,))
        reg_data = cursor.fetchone()
        
        if not reg_data:
            return jsonify({
                'success': False,
                'message': 'Registration not found'
            }), 404
        
        emp_id = reg_data['employee_id']
        device_id = reg_data['device_id']
        device_fingerprint = reg_data['device_fingerprint']
        
        # Update employee device info with fingerprint
        cursor.execute('''
            UPDATE employees 
            SET device_id = ?, device_approved = 1, device_fingerprint = ?
            WHERE emp_id = ?
        ''', (device_id, device_fingerprint, emp_id))
        
        # Update registration status
        cursor.execute('''
            UPDATE device_registrations 
            SET status = 'approved'
            WHERE reg_id = ?
        ''', (reg_id,))
        
        conn.commit()
    
    return jsonify({
        'success': True,
        'message': 'Device approved successfully'
    })

@app.route('/admin/reject-device/<reg_id>', methods=['POST'])
def admin_reject_device(reg_id):
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        # Check if registration exists
        cursor.execute('SELECT reg_id FROM device_registrations WHERE reg_id = ?', (reg_id,))
        if not cursor.fetchone():
            return jsonify({
                'success': False,
                'message': 'Registration not found'
            }), 404
        
        # Update registration status
        cursor.execute('''
            UPDATE device_registrations 
            SET status = 'rejected'
            WHERE reg_id = ?
        ''', (reg_id,))
        conn.commit()
    
    return jsonify({
        'success': True,
        'message': 'Device registration rejected'
    })

# Geofence configuration routes
@app.route('/admin/geofence-config', methods=['GET'])
def get_geofence_config():
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT latitude, longitude, radius FROM geofence_config ORDER BY id DESC LIMIT 1')
        config = cursor.fetchone()
        
        if config:
            return jsonify({
                'success': True,
                'config': {
                    'latitude': config['latitude'],
                    'longitude': config['longitude'],
                    'radius': config['radius']
                }
            })
        else:
            return jsonify({
                'success': True,
                'config': {
                    'latitude': GEOFENCE_CONFIG['latitude'],
                    'longitude': GEOFENCE_CONFIG['longitude'],
                    'radius': GEOFENCE_CONFIG['radius']
                }
            })

@app.route('/admin/geofence-config', methods=['POST'])
def update_geofence_config():
    if 'admin_id' not in session:
        return jsonify({
            'success': False,
            'message': 'Unauthorized'
        }), 401
    
    data = request.get_json()
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    radius = data.get('radius')
    
    # Validate inputs
    if latitude is None or longitude is None or radius is None:
        return jsonify({
            'success': False,
            'message': 'Missing required fields'
        }), 400
    
    try:
        latitude = float(latitude)
        longitude = float(longitude)
        radius = float(radius)
        
        if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
            return jsonify({
                'success': False,
                'message': 'Invalid latitude or longitude values'
            }), 400
        
        if radius <= 0:
            return jsonify({
                'success': False,
                'message': 'Radius must be greater than 0'
            }), 400
    except ValueError:
        return jsonify({
            'success': False,
            'message': 'Invalid number format'
        }), 400
    
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        # Check if config exists
        cursor.execute('SELECT id FROM geofence_config ORDER BY id DESC LIMIT 1')
        existing = cursor.fetchone()
        
        if existing:
            # Update existing config
            cursor.execute('''
                UPDATE geofence_config 
                SET latitude = ?, longitude = ?, radius = ?
                WHERE id = ?
            ''', (latitude, longitude, radius, existing['id']))
        else:
            # Insert new config
            cursor.execute('''
                INSERT INTO geofence_config (latitude, longitude, radius)
                VALUES (?, ?, ?)
            ''', (latitude, longitude, radius))
        conn.commit()
    
    return jsonify({
        'success': True,
        'message': 'Geofence configuration updated successfully'
    })

# Employee device status route
@app.route('/employee/device-status')
def employee_device_status():
    if 'employee_id' not in session:
        return jsonify({
            'success': False,
            'message': 'Unauthorized'
        }), 401
    
    emp_id = session['employee_id']
    
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT device_id, device_approved FROM employees WHERE emp_id = ?', (emp_id,))
        employee = cursor.fetchone()
        
        if employee:
            return jsonify({
                'success': True,
                'deviceId': employee['device_id'],
                'deviceApproved': bool(employee['device_approved'])
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Employee not found'
            }), 404

# Get geofence config for employee
@app.route('/employee/geofence-config')
def employee_geofence_config():
    with closing(get_db()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT latitude, longitude, radius FROM geofence_config ORDER BY id DESC LIMIT 1')
        config = cursor.fetchone()
        
        if config:
            return jsonify({
                'success': True,
                'config': {
                    'latitude': config['latitude'],
                    'longitude': config['longitude'],
                    'radius': config['radius']
                }
            })
        else:
            return jsonify({
                'success': True,
                'config': {
                    'latitude': GEOFENCE_CONFIG['latitude'],
                    'longitude': GEOFENCE_CONFIG['longitude'],
                    'radius': GEOFENCE_CONFIG['radius']
                }
            })

# Logout routes
@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')


