const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 3500;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
// const stripe = require("stripe")(
//   `Authorization: Bearer ${process.env.PAYMENT_SECRET_KEY}`
// );
const app = express();
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.t9okwyq.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // collection here
    const classCollection = client.db("edumi").collection("allClasses");
    const usersCollection = client.db("edumi").collection("users");
    const terCollection = client.db("edumi").collection("ter");
    const teachersCollection = client.db("edumi").collection("teachers");
    const assignmentsCollection = client.db("edumi").collection("assignments");
    const submittedAssignmentCollection = client
      .db("edumi")
      .collection("submittedAssignment");

    const enrolledClassesCollection = client
      .db("edumi")
      .collection("enrolledClasses");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });
    app.post("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });
    // save users and update role
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        if (user?.status === "requested") {
          const result = await usersCollection.updateOne(
            query,
            {
              $set: user,
            },
            options
          );
          return res.send(result);
        } else {
          return res.send(isExist);
        }
      }
      const result = await usersCollection.updateOne(
        query,
        {
          $set: user,
        },
        options
      );
      res.send(result);
    });
    // get all classes for user apis
    app.get("/allclasses", async (req, res) => {
      const query = { status: "approved" };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });
    // get all classes for admin apis
    app.get("/admin/allclasses", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });
    // //add class
    // app.post("/allclasses", (req, res) => {
    //   const data = req.body;
    //   const result = classCollection.insertMany(data);
    //   res.send(result);
    // });
    // single classes apis
    app.get("/allclasses/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    // create-payment-intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      if (!price || amount < 1) return;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: client_secret });
    });

    // Save classInfo in enrolledClassesCollection
    app.post("/enrolledclasses", async (req, res) => {
      const info = req.body;
      const filter = { _id: new ObjectId(info.classId) };
      const option = { upsert: true };
      const updatedDoc = {
        $inc: { totalEnrollment: 1 },
      };
      const result = await enrolledClassesCollection.insertOne(info);
      const update = await classCollection.updateOne(
        filter,
        updatedDoc,
        option
      );
      console.log(update);
      res.send(result);
    });

    // check isAlreadyEnrolled

    app.get("/enrolledclasses/:id", async (req, res) => {
      const { id } = req.params;
      const email = req.query.email;
      console.log(email);
      const query = { classId: id, studentEmail: email };
      const isAlreadyEnrolled = await enrolledClassesCollection.findOne(query);
      res.send(isAlreadyEnrolled);
    });

    // Get user role
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });
    // get enrolled classes
    app.get("/myenrolledclasses/:email", async (req, res) => {
      const email = req.params.email;
      const result = await enrolledClassesCollection
        .find({
          studentEmail: email,
        })
        .toArray();
      res.send(result);
    });
    // post ter report
    app.post("/ter", async (req, res) => {
      const report = req.body;
      const result = await terCollection.insertOne(report);
      res.send(result);
    });
    // get ter report
    app.get("/ter/:id", async (req, res) => {
      const id = req.params.id;
      const query = { classId: id };
      const result = await terCollection.find(query).toArray();
      res.send(result);
    });
    //teacher request api
    app.post("/teachonedumi", async (req, res) => {
      const teachersDetails = req.body;
      const result = await teachersCollection.insertOne(teachersDetails);
      res.send(result);
    });
    // check if the teacher already request or already a teacher
    app.get("/teacher/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { email };
      const result = await teachersCollection.findOne(query);
      res.send(result);
    });
    //get pending teacher requests
    app.get("/teacherrequests", async (req, res) => {
      const query = {
        status: "pending",
      };
      const result = await teachersCollection.find(query).toArray();
      res.send(result);
    });

    // approve teacher request
    app.put("/teacherrequests/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const updatedDoc1 = {
        $set: {
          status: "approved",
        },
      };
      const updatedDoc2 = {
        $set: {
          role: "Teacher",
        },
      };
      const updateTeacherCollection = await teachersCollection.updateOne(
        query,
        updatedDoc1
      );
      console.log(updateTeacherCollection);
      const updateUserCollection = await usersCollection.updateOne(
        query,
        updatedDoc2
      );
      console.log(updateUserCollection);
      res.send("updated");
    });
    //decline teacher request
    app.delete("/teacherrequests/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await teachersCollection.deleteOne(query);
      res.send(result);
    });
    //get all users
    app.get("/allusers", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    // make admin
    app.put("/make-admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const updatedRole = {
        $set: {
          role: "Admin",
        },
      };
      const result = await usersCollection.updateOne(query, updatedRole);
      res.send(result);
    });
    // add class api
    app.post("/addclass", async (req, res) => {
      const data = req.body;
      const result = await classCollection.insertOne(data);
      res.send(result);
    });
    //get my classs api
    app.get("/myclasses/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });
    //delete my class
    app.delete("/myclasses/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.deleteOne(query);
      res.send(result);
    });
    // update my class
    app.put("/myclasses/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const data = req.body;
      console.log(data);
      const updatedDoc = {
        $set: {
          title: data.title,
          price: data.price,
          description: data.description,
          image: data.image,
          status: "pending",
        },
      };
      const result = await classCollection.updateOne(query, updatedDoc);
      res.send(result);
      console.log(result);
    });
    //create assignment
    app.post("/assignments", async (req, res) => {
      const data = req.body;
      const result = await assignmentsCollection.insertOne(data);
      res.send(result);
    });
    // get assignments
    app.get("/assignments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { classId: id };
      const result = await assignmentsCollection.find(query).toArray();
      res.send(result);
    });
    // approve class by admin
    app.put("/admin/allclasses/approve/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "approved",
        },
      };
      const result = await classCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    // reject class by admin
    app.put("/admin/allclasses/reject/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "rejected",
        },
      };
      const result = await classCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    // get student class's assignment
    app.get("/students/assignments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { classId: id };
      const result = await assignmentsCollection.find(query).toArray();
      res.send(result);
    });
    // submit assignments by student
    app.post("/student/submitAssignment", async (req, res) => {
      const info = req.body;
      const result = await submittedAssignmentCollection.insertOne(info);
      res.send(result);
    });
    // get all the submitted assignments by classId
    app.get("/submittedAssignments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { classId: id };
      const result = await submittedAssignmentCollection.find(query).toArray();
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("server is running");
});
app.listen(port, () => {
  console.log(`server is listening on ${port}`);
});
