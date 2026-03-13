const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 简单的内存认证（生产环境要改进）
const AUTH_TOKEN = 'admin123';

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');

// 读取数据
function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { reservations: [], customers: [] };
  }
}

// 保存数据
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 验证
function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (token === AUTH_TOKEN) {
    next();
  } else {
    res.status(401).json({ error: '未授权' });
  }
}

// ==================== 静态文件服务 ====================
// 主预约系统在 /hq 路径
app.use('/hq', express.static('public'));

// 根路径重定向到 /hq
app.get('/', (req, res) => {
  res.redirect('/hq');
});

// ==================== 预约 API ====================

// 获取所有预约
app.get('/api/reservations', (req, res) => {
  const data = readData();
  res.json(data.reservations);
});

// 获取某月预约
app.get('/api/reservations/:year/:month', (req, res) => {
  const { year, month } = req.params;
  const data = readData();
  const filtered = data.reservations.filter(r => {
    const d = new Date(r.date);
    return d.getFullYear() === parseInt(year) && d.getMonth() === parseInt(month) - 1;
  });
  res.json(filtered);
});

// 添加预约
app.post('/api/reservations', authMiddleware, (req, res) => {
  const data = readData();
  const newReservation = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  data.reservations.push(newReservation);
  saveData(data);
  res.json(newReservation);
});

// 更新预约
app.put('/api/reservations/:id', authMiddleware, (req, res) => {
  const data = readData();
  const index = data.reservations.findIndex(r => r.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: '预约不存在' });
  }
  data.reservations[index] = { ...data.reservations[index], ...req.body };
  saveData(data);
  res.json(data.reservations[index]);
});

// 删除预约
app.delete('/api/reservations/:id', authMiddleware, (req, res) => {
  const data = readData();
  data.reservations = data.reservations.filter(r => r.id !== req.params.id);
  saveData(data);
  res.json({ success: true });
});

// 统计
app.get('/api/stats', (req, res) => {
  const data = readData();
  const total = data.reservations.length;
  const totalRevenue = data.reservations.reduce((sum, r) => sum + (parseFloat(r.price) || 0), 0);
  res.json({ total, totalRevenue });
});

// ==================== VIP 客户 API ====================

// 获取所有客户
app.get('/api/customers', (req, res) => {
  const data = readData();
  res.json(data.customers || []);
});

// 获取单个客户
app.get('/api/customers/:id', (req, res) => {
  const data = readData();
  const customer = data.customers.find(c => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: '客户不存在' });
  }
  res.json(customer);
});

// 添加客户
app.post('/api/customers', authMiddleware, (req, res) => {
  const data = readData();
  if (!data.customers) data.customers = [];
  
  const newCustomer = {
    id: Date.now().toString(),
    name: req.body.name,
    phone: req.body.phone || '',
    preferences: req.body.preferences || '',
    habits: req.body.habits || '',
    balance: parseFloat(req.body.balance) || 0,
    totalDeposited: parseFloat(req.body.balance) || 0,
    totalSpent: 0,
    wineInventory: [],
    transactions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  data.customers.push(newCustomer);
  saveData(data);
  res.json(newCustomer);
});

// 更新客户
app.put('/api/customers/:id', authMiddleware, (req, res) => {
  const data = readData();
  const index = data.customers.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: '客户不存在' });
  }
  
  data.customers[index] = { 
    ...data.customers[index], 
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  saveData(data);
  res.json(data.customers[index]);
});

// 删除客户
app.delete('/api/customers/:id', authMiddleware, (req, res) => {
  const data = readData();
  data.customers = data.customers.filter(c => c.id !== req.params.id);
  saveData(data);
  res.json({ success: true });
});

// 客户充值
app.post('/api/customers/:id/deposit', authMiddleware, (req, res) => {
  const data = readData();
  const customer = data.customers.find(c => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: '客户不存在' });
  }
  
  const amount = parseFloat(req.body.amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: '金额无效' });
  }
  
  customer.balance += amount;
  customer.totalDeposited += amount;
  customer.transactions.push({
    id: Date.now().toString(),
    type: 'deposit',
    amount: amount,
    note: req.body.note || '充值',
    date: new Date().toISOString()
  });
  customer.updatedAt = new Date().toISOString();
  
  saveData(data);
  res.json(customer);
});

// 客户消费
app.post('/api/customers/:id/spend', authMiddleware, (req, res) => {
  const data = readData();
  const customer = data.customers.find(c => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: '客户不存在' });
  }
  
  const amount = parseFloat(req.body.amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: '金额无效' });
  }
  
  if (customer.balance < amount) {
    return res.status(400).json({ error: '余额不足' });
  }
  
  customer.balance -= amount;
  customer.totalSpent += amount;
  customer.transactions.push({
    id: Date.now().toString(),
    type: 'spend',
    amount: amount,
    note: req.body.note || '消费',
    date: new Date().toISOString()
  });
  customer.updatedAt = new Date().toISOString();
  
  saveData(data);
  res.json(customer);
});

// 添加酒水
app.post('/api/customers/:id/wine', authMiddleware, (req, res) => {
  const data = readData();
  const customer = data.customers.find(c => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: '客户不存在' });
  }
  
  if (!customer.wineInventory) customer.wineInventory = [];
  
  const wine = {
    id: Date.now().toString(),
    name: req.body.name,
    quantity: parseInt(req.body.quantity) || 1,
    note: req.body.note || '',
    addedAt: new Date().toISOString()
  };
  
  customer.wineInventory.push(wine);
  customer.updatedAt = new Date().toISOString();
  
  saveData(data);
  res.json(customer);
});

// 删除酒水
app.delete('/api/customers/:id/wine/:wineId', authMiddleware, (req, res) => {
  const data = readData();
  const customer = data.customers.find(c => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: '客户不存在' });
  }
  
  customer.wineInventory = customer.wineInventory.filter(w => w.id !== req.params.wineId);
  customer.updatedAt = new Date().toISOString();
  
  saveData(data);
  res.json(customer);
});

// 搜索客户
app.get('/api/customers/search/:keyword', (req, res) => {
  const data = readData();
  const keyword = req.params.keyword.toLowerCase();
  const results = data.customers.filter(c => 
    c.name.toLowerCase().includes(keyword) ||
    (c.phone && c.phone.includes(keyword))
  );
  res.json(results);
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`预约系统访问: http://localhost:${PORT}/hq`);
});
