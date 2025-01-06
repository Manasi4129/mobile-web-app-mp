const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

// Allow all origins for CORS (important for local dev)
app.use(cors());
app.use(express.json());

// Database connection
const db = mysql.createConnection({
	host: "localhost",
	user: "root",
	password: "parth@123",
	database: "slpp",
});

db.connect((err) => {
	if (err) throw err;
	console.log("Connected to database");
});

// Registration route
app.post("/api/register", (req, res) => {
	const { full_name, email, password, dob, bioID } = req.body;

	// Check if all fields are provided
	if (!full_name || !email || !password || !dob || !bioID) {
		return res.status(400).json({ error: "All fields are required" });
	}

	// Check if the user already exists
	const checkQuery = "SELECT * FROM petitioners WHERE petitioner_email = ?";
	db.query(checkQuery, [email], (err, result) => {
		if (err) {
			return res.status(500).json({ error: "Database query error" });
		}

		if (result.length > 0) {
			return res.status(400).json({ error: "User already exists" });
		}

		// Insert the new user into the database
		const insertQuery =
			"INSERT INTO petitioners (fullname, petitioner_email, password_hash, dob, bioID) VALUES (?, ?, ?, ?, ?)";
		db.query(
			insertQuery,
			[full_name, email, password, dob, bioID],
			(err, result) => {
				if (err) {
					console.log(err);
					return res.status(500).json({ error: "Error registering user" });
				}

				console.log("User registered:", email);
				res.json({ message: "Registration successful" });
			}
		);
	});
});

// Login route
app.post("/api/login", (req, res) => {
	const { email, password } = req.body;

	console.log("Received credentials:", email, password); // Debug log to see what is being sent

	const query = "SELECT * FROM petitioners WHERE petitioner_email = ?";
	db.query(query, [email], (err, result) => {
		if (err) {
			return res.status(500).json({ error: "Database query error" });
		}

		if (result.length === 0) {
			return res.status(400).json({ error: "User not found" });
		}

		console.log(result);

		const user = result[0];

		// Compare plain text password
		if (password !== user.password_hash) {
			console.log("Passwords do not match"); // Log if passwords don't match
			return res.status(400).json({ error: "Invalid password" });
		}

		console.log("Login successful for email:", email);
		return res.json({ message: "Login successful" });
	});
});

// Start the server
app.listen(5000, () => {
	console.log("Server is running on port 5000");
});
