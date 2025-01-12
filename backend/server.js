const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const jwt = require("jsonwebtoken");

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
app.post("/slpp/register", (req, res) => {
	const { full_name, email, password, dob, bioID } = req.body;

	// Check if all fields are provided
	if (!full_name || !email || !password || !dob || !bioID) {
		return res.status(400).json({ error: "All fields are required" });
	}

	// Check if the user already exists
	const checkUserQuery = "SELECT * FROM petitioners WHERE petitioner_email = ?";
	db.query(checkUserQuery, [email], (err, userResult) => {
		if (err) {
			return res.status(500).json({ error: "Database query error" });
		}

		if (userResult.length > 0) {
			return res.status(400).json({ error: "User already exists" });
		}

		// Check if the BioID is valid and not already used
		const checkBioIDQuery = "SELECT * FROM bioid WHERE code = ?";
		db.query(checkBioIDQuery, [bioID], (err, bioIDResult) => {
			if (err) {
				return res.status(500).json({ error: "Database query error" });
			}

			// If BioID doesn't exist or is already used
			if (bioIDResult.length === 0) {
				return res.status(400).json({ error: "Invalid BioID" });
			}
			if (bioIDResult[0].used > 0) {
				return res.status(400).json({ error: "BioID already used." });
			}

			// Insert the new user into the database
			const insertUserQuery =
				"INSERT INTO petitioners (fullname, petitioner_email, password_hash, dob, bioID) VALUES (?, ?, ?, ?, ?)";
			db.query(
				insertUserQuery,
				[full_name, email, password, dob, bioID],
				(err, insertResult) => {
					if (err) {
						console.log(err);
						return res.status(500).json({ error: "Error registering user" });
					}

					// Update the BioID to mark it as used
					const updateBioIDQuery = "UPDATE bioid SET used = 1 WHERE code = ?";
					db.query(updateBioIDQuery, [bioID], (err) => {
						if (err) {
							console.error(err);
							return res
								.status(500)
								.json({ error: "Error updating BioID status" });
						}

						console.log("User registered and BioID updated:", email);
						res.json({ message: "Registration successful" });
					});
				}
			);
		});
	});
});

// Secret key (for testing)
const JWT_SECRET_KEY = "abajaba";

// Login route
app.post("/slpp/login", (req, res) => {
	const { email, password } = req.body;

	const query = "SELECT * FROM petitioners WHERE petitioner_email = ?";
	db.query(query, [email], (err, result) => {
		if (err) {
			return res.status(500).json({ error: "Database query error" });
		}

		if (result.length === 0) {
			return res.status(400).json({ error: "User not found" });
		}

		const user = result[0];
		console.log("Current User: ", user);
		console.log("Current user email: ", user.petitioner_email);

		// Compare plain text password
		if (password !== user.password_hash) {
			return res.status(400).json({ error: "Invalid password" });
		}

		// If credentials are valid, generate a JWT token
		const token = jwt.sign(
			{ userId: user.id, email: user.petitioner_email },
			JWT_SECRET_KEY,
			{ expiresIn: "1h" }
		);

		res.json({
			message: "Login successfull",
			token: token,
			fullName: user.fullname,
			email: user.petitioner_email,
			password: user.password_hash,
		});
	});
});

/**
 * Petitions flow
 */

// Create a new petition
app.post("/slpp/create-petition", (req, res) => {
	const { petitioner_email, title, content } = req.body;

	if (!petitioner_email || !title || !content) {
		return res.status(400).json({ error: "All fields are required" });
	}

	const query =
		"INSERT INTO petitions (petitioner_email, title, content) VALUES (?, ?, ?)";
	db.query(query, [petitioner_email, title, content], (err, result) => {
		if (err) {
			console.error(err);
			return res
				.status(500)
				.json({ error: "Database error while creating petition" });
		}
		res.json({
			message: "Petition created successfully",
			petitionId: result.insertId,
		});
	});
});

// Read all petitions for a specific user
app.get("/slpp/user-petitions", (req, res) => {
	const { email } = req.query;

	if (!email) {
		return res.status(400).json({ error: "Email is required" });
	}

	const query = "SELECT * FROM petitions WHERE petitioner_email = ?";
	db.query(query, [email], (err, results) => {
		if (err) {
			console.error(err);
			return res
				.status(500)
				.json({ error: "Database error while fetching petitions" });
		}
		res.json(results);
	});
});

// Update a petition
app.put("/slpp/user-petition/:id", (req, res) => {
	const { id } = req.params;
	const { title, content, status, response } = req.body;

	const query =
		"UPDATE petitions SET title = ?, content = ?, status = ?, response = ? WHERE petition_id = ?";
	db.query(query, [title, content, status, response, id], (err, result) => {
		if (err) {
			console.error(err);
			return res
				.status(500)
				.json({ error: "Database error while updating petition" });
		}

		if (result.affectedRows === 0) {
			return res.status(404).json({ error: "Petition not found" });
		}

		res.json({ message: "Petition updated successfully" });
	});
});

// Delete a petition
app.delete("/slpp/user-petition/:id", (req, res) => {
	const { id } = req.params;

	const query = "DELETE FROM petitions WHERE petition_id = ?";
	db.query(query, [id], (err, result) => {
		if (err) {
			console.error(err);
			return res
				.status(500)
				.json({ error: "Database error while deleting petition" });
		}

		if (result.affectedRows === 0) {
			return res.status(404).json({ error: "Petition not found" });
		}

		res.json({ message: "Petition deleted successfully" });
	});
});

// Read all petitions with petitioner details, optionally filtered by status
app.get("/slpp/petitions", (req, res) => {
	const { status, excludeEmail } = req.query;

	// Base query
	let query = `
	   SELECT 
		  p.petition_id, 
		  p.title, 
		  p.content, 
		  p.status, 
		  p.response, 
		  p.signature_count, 
		  pt.fullname AS petitioner_name
	   FROM 
		  petitions p
	   JOIN 
		  petitioners pt 
	   ON 
		  p.petitioner_email = pt.petitioner_email
	`;

	const queryParams = [];

	// Add conditions for status and excluding specific email
	const conditions = [];
	if (status) {
		conditions.push(`p.status = ?`);
		queryParams.push(status);
	}
	if (excludeEmail) {
		conditions.push(`p.petitioner_email != ?`);
		queryParams.push(excludeEmail);
	}

	if (conditions.length > 0) {
		query += ` WHERE ${conditions.join(" AND ")}`;
	}

	db.query(query, queryParams, (err, results) => {
		if (err) {
			console.error(err);
			return res
				.status(500)
				.json({ error: "Database error while fetching petitions" });
		}
		res.json({ petitions: results });
	});
});

// Update petition status
app.put("/slpp/user-petition/:id/status", (req, res) => {
	const { id } = req.params;
	const { status } = req.body;

	if (!status) {
		return res.status(400).json({ error: "Status is required" });
	}

	const query = "UPDATE petitions SET status = ? WHERE petition_id = ?";
	db.query(query, [status, id], (err, result) => {
		if (err) {
			console.error(err);
			return res
				.status(500)
				.json({ error: "Database error while updating status" });
		}

		if (result.affectedRows === 0) {
			return res.status(404).json({ error: "Petition not found" });
		}

		res.json({ message: "Status updated successfully" });
	});
});

// Save feedback for a petition
app.put("/slpp/user-petition/:id/feedback", (req, res) => {
	const { id } = req.params;
	const { feedback } = req.body;

	if (!feedback) {
		return res.status(400).json({ error: "Feedback is required" });
	}

	const query = "UPDATE petitions SET response = ? WHERE petition_id = ?";
	db.query(query, [feedback, id], (err, result) => {
		if (err) {
			console.error(err);
			return res
				.status(500)
				.json({ error: "Database error while saving feedback" });
		}

		if (result.affectedRows === 0) {
			return res.status(404).json({ error: "Petition not found" });
		}

		res.json({ message: "Feedback saved successfully" });
	});
});

// Start the server
app.listen(5000, () => {
	console.log("Server is running on port 5000");
});
