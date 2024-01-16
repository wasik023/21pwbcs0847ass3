const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const app = express();
const port = 3000;
const url = 'mongodb://localhost:27017';
const database = 'ass3';
mongoose.connect(`${url}/${database}`);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'your-secret-key', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
const User = mongoose.model('User', new mongoose.Schema({
  username: String,
  password: String,
  isAdmin: { type: Boolean, default: false },
}));
passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      const user = await User.findOne({ username: username });
      if (!user) { 
        return done(null, false, { message: 'Incorrect username.' }); 
      }
      if (!user.isAdmin) {
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (passwordMatch) {
          return done(null, user);
        } else {
          return done(null, false, { message: 'Incorrect password.' });
        }
      } else {
        return done(null, user);
      }
    } catch (error) {
      return done(error);
    }
  }));
passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  } else {
    res.status(401).json({ message: 'Unauthorized.' });
  }
};
const isAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.isAdmin) {
      return next();
    } else {
      res.status(403).json({ message: 'Access forbidden.' });
    }
  };
// Assuming this route is protected and accessible only to admin users
app.post('/create-admin', async (req, res) => {
    const { username, password } = req.body;
    try {
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
      const newAdmin = new User({ username, password: hashedPassword, isAdmin: true });
      await newAdmin.save();
      res.status(201).json({ message: 'Admin created successfully.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });
app.get('/admin-dashboard', isAuthenticated, isAdmin, (req, res) => {
    // This route is accessible only to authenticated admins
    res.json({ message: 'Welcome to admin dashboard!' });
  });

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  formula: String, 
});
const Product = mongoose.model('Product', productSchema, 'medicines');
// Product routes
app.get('/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/products', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { name, price, formula } = req.body;
    const newProduct = new Product({ name, price, formula });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.put('/products/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, formula } = req.body;
    const updatedProduct = await Product.findByIdAndUpdate(id, { name, price, formula }, { new: true });
    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.delete('/products/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await Product.findByIdAndDelete(id);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
// Authentication routes
app.post('/login', passport.authenticate('local'), (req, res) => {
  res.json({ message: 'Login successful.' });
});
// Route for user logout
app.get('/logout', (req, res) => {
  req.logout(() => {
    res.json({ message: 'Logout successful.' });
  });
})
app.post('/signup', async (req, res) => {
  const { username, password, isAdmin } = req.body;
  try {
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, isAdmin });
    await newUser.save();
    res.status(201).json({ message: 'User created successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
// Shopping Cart routes and functions
const CartItem = mongoose.model('CartItem', new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: Number,
}));
app.get('/cart', isAuthenticated, async (req, res) => {
  try {
    const userCart = await CartItem.find({ user: req.user._id }).populate('product');
    res.json(userCart);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/cart/add/:productId', isAuthenticated, async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    const cartItem = new CartItem({ product: product._id, quantity, user: req.user._id });
    await cartItem.save();
    
    res.status(201).json(cartItem);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.put('/cart/update/:cartItemId', isAuthenticated, async (req, res) => {
  try {
    const { cartItemId } = req.params;
    const { quantity } = req.body;

    const updatedCartItem = await CartItem.findByIdAndUpdate(cartItemId, { quantity }, { new: true });
    res.json(updatedCartItem);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.delete('/cart/remove/:cartItemId', isAuthenticated, async (req, res) => {
  try {
    const { cartItemId } = req.params;
    await CartItem.findByIdAndDelete(cartItemId);
    res.json({ message: 'Item removed from the cart.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.post('/checkout', isAuthenticated, async (req, res) => {
  try {

    res.json({ message: 'Checkout successful.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/order-history', isAuthenticated, async (req, res) => {
  try {
    
    res.json({ message: 'Order history retrieved successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/products/:sort', async (req, res) => {
  try {
    const { sort } = req.params;
    let products;

    switch (sort) {
      case 'name':
        products = await Product.find().sort({ name: 1 });
        break;
      case 'price':
        products = await Product.find().sort({ price: 1 });
        break;
      // Add more cases for additional sorting options
      default:
        products = await Product.find();
    }

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port http://localhost:${port}`);
});