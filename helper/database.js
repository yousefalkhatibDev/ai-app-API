let mysql = require("mysql");

const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "ai-app",
    port: 3306,
    connectionLimit: 5,
});



const conn = pool.getConnection((err, connection) => {
    if (err) {
        console.log(err)
        if (err.code === "PROTOCOL_CONNECTION_LOST") {
            console.error("Database connection lost");
        }
        if (err.code === "ER_CON_COUNT_ERROR") {
            console.error("Database has too many connection");
        }
        if (err.code === "ECONNREFUSED") {
            console.error("Database connection was refused");
        }
    }
    if (connection) {
        connection.release();
        console.log("Connected to database")
    }
    return;
});

module.exports = { pool, conn };