import express from "express";
import Todo from "../models/todo.js";
import auth from "../middleware/auth.js";
import nodemailer from "nodemailer"; 

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmailNotification = async (email, todo, type = 'new_task') => {
  let subject, text;

  switch (type) {
    case 'new_task':
      subject = 'You have been assigned a new task';
      text = `You have been assigned a new task: ${todo.title}. View it here: https://todo-client-ashen.vercel.app/todos/${todo._id}`;
      break;
    case 'supervisor_comment':
      subject = 'New supervisor comment on your task';
      text = `Your supervisor has commented on your task: "${todo.title}". View it here: https://todo-client-ashen.vercel.app/todos/${todo._id}`;
      break;
    case 'status_update':
      subject = 'Task status updated by supervisor';
      text = `The status of your task "${todo.title}" has been updated to ${todo.status}. View it here: https://todo-client-ashen.vercel.app/todos/${todo._id}`;
      break;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject,
    text,
  };

  await transporter.sendMail(mailOptions);
};


router.get("/api/todos/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;  
    const authenticatedUserId = req.user.id;  

    // Validate userId format
    if (!userId || !/^[a-fA-F0-9]{24}$/.test(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    // Check if the authenticated user matches the userId
    if (authenticatedUserId !== userId) {
      return res.status(401).json({ error: "Unauthorized access" });
    }

    const todos = await Todo.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json(todos);
  } catch (err) {
    console.error("Error fetching todos:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/todos", auth, async (req, res) => {
  try {
    const todoData = {
      ...req.body,
      userId: req.user.id,
      completed: false,
      showSubtasks: req.body.subtodos && req.body.subtodos.length > 0,
      comments: [], 
    };

    const newTodo = new Todo(todoData);
    await newTodo.save();

    if (newTodo.assignedTo) {
      await sendEmailNotification(newTodo.assignedTo, newTodo, 'new_task');
    }

    res.status(201).json(newTodo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


router.put("/api/todos/:id", auth, async (req, res) => {
  try {
    const { id } = req.params; 
    const userId = req.user.id; 

    // Find the todo and ensure it belongs to the authenticated user
    const updatedTodo = await Todo.findOneAndUpdate(
      { _id: id, userId },
      {
        title: req.body.title, // Update only specific fields
        description: req.body.description,
      },
      { new: true }
    );

    if (!updatedTodo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.status(200).json(updatedTodo);
  } catch (err) {
    console.error("Error updating todo:", err);
    res.status(400).json({ error: err.message });
  }
});

router.get("/api/supervisor/todos/:todoId", auth, async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.todoId });
    
    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    // Check if the authenticated user is the assigned supervisor
    if (req.user.email !== todo.assignedTo) {
      return res.status(401).json({ error: "Unauthorized access" });
    }

    res.status(200).json(todo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// route for supervisor comments
router.post("/api/supervisor/todos/:todoId/comments", auth, async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.todoId);
    
    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    // Verify the authenticated user is the assigned supervisor
    if (req.user.email !== todo.assignedTo) {
      return res.status(401).json({ error: "Unauthorized access" });
    }

    const newComment = {
      text: req.body.text,
      author: 'supervisor',
      authorEmail: req.user.email,
      createdAt: new Date()
    };

    todo.comments = [...(todo.comments || []), newComment];
    await todo.save();

    // Send email notification to the task owner
    await sendEmailNotification(todo.userId, todo, 'supervisor_comment');

    res.status(201).json(todo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//  route for supervisor to update task status
router.put("/api/supervisor/todos/:todoId/status", auth, async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.todoId);
    
    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    // Verify the authenticated user is the assigned supervisor
    if (req.user.email !== todo.assignedTo) {
      return res.status(401).json({ error: "Unauthorized access" });
    }

    todo.status = req.body.status;
    if (req.body.status === 'completed') {
      todo.completed = true;
    }

    await todo.save();

    // Send email notification about status update
    await sendEmailNotification(todo.userId, todo, 'status_update');

    res.status(200).json(todo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//  delete route
router.delete("/api/todos/:id", auth, async (req, res) => {
  try {
    const deletedTodo = await Todo.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!deletedTodo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.status(200).json({ message: "Todo deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;