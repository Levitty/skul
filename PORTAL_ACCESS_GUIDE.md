# 🎭 Accessing Different Portals

## 📋 Quick Access Guide

### **Current User (School Admin)**
You're logged in as: `mlevitty@gmail.com` with `school_admin` role.

As a school admin, you can access ALL modules through the sidebar:
- ✅ Dashboard
- ✅ Students
- ✅ Admissions
- ✅ Attendance
- ✅ Timetable
- ✅ Fees
- ✅ Financials
- ✅ Grades
- ✅ Strategic Analytics

---

## 🎯 Accessing Other Portals

### **Method 1: Direct URL Access** (Quick Test)

While logged in as admin, you can directly visit:

**Parent Portal:**
```
http://localhost:3000/dashboard/parent/dashboard
```

**Teacher Portal:**
```
http://localhost:3000/dashboard/teacher/attendance
http://localhost:3000/dashboard/teacher/grades
```

**Accountant Portal:**
```
http://localhost:3000/dashboard/accountant/fees
http://localhost:3000/dashboard/admin/financials
```

---

## 👥 Method 2: Create Role-Based Test Accounts (Recommended)

### **Step 1: Create Test Accounts**

1. **Sign up new users** at `http://localhost:3000/signup`:
   - `parent@test.com` (password: your choice)
   - `teacher@test.com` (password: your choice)
   - `accountant@test.com` (password: your choice)

2. **Run the SQL script** in Supabase SQL Editor:
   - Open file: `CREATE_TEST_ACCOUNTS.sql`
   - Update email addresses if you used different ones
   - Run the entire script

3. **Log out and log in** with each test account to see their respective portals

---

## 🔐 Understanding Roles

### **school_admin** (Your current role)
- Access to ALL modules
- Can manage everything
- Strategic analytics access

### **parent**
- Parent Portal dashboard
- View their child's grades
- View attendance
- Make payments
- View upcoming events

### **teacher**
- Teacher Portal
- Mark attendance
- Enter grades
- View timetable
- Manage classes

### **accountant**
- Fees & Payments module
- Financial Reports
- Transaction management
- Budget tracking

---

## 🎨 What Each Portal Shows

### **Parent Portal** (`/dashboard/parent/dashboard`)
```
✨ Beautiful Features:
- Child's academic performance with grade charts
- Attendance rate (96%)
- Fee balance status
- Upcoming events calendar
- Recent activity feed
- Quick actions (payments, messaging, report cards)
- Mobile-optimized design
```

### **Teacher Portal**
```
📚 Features:
- Attendance: /dashboard/teacher/attendance
  - Mark attendance by class
  - View weekly trends
  - Today's stats

- Grades: /dashboard/teacher/grades
  - Grade distribution
  - Subject performance
  - Top performers
  - Class selection
```

### **Accountant Portal**
```
💰 Features:
- Fees: /dashboard/accountant/fees
  - Payment recording
  - Transaction history
  - Payment methods (M-Pesa, Bank, Cash)
  
- Financials: /dashboard/admin/financials
  - P&L statement
  - Cash flow analysis
  - Budget vs Actual
  - Financial KPIs
```

---

## 🚀 Quick Setup (5 minutes)

1. **Open a new browser incognito window**
2. Go to `http://localhost:3000/signup`
3. Sign up with `parent@test.com`
4. **Keep that window open** (don't verify email, it will still work)
5. In Supabase SQL Editor, run the parent section from `CREATE_TEST_ACCOUNTS.sql`
6. Refresh the browser - you should see the Parent Portal!

---

## 🎭 Testing Tip

Open **multiple browser profiles** to test different roles simultaneously:
- **Chrome Profile 1**: School Admin (mlevitty@gmail.com)
- **Chrome Profile 2**: Parent (parent@test.com)
- **Chrome Profile 3**: Teacher (teacher@test.com)
- **Incognito**: Accountant (accountant@test.com)

---

## 🔧 Troubleshooting

**Issue**: "User not associated with any school"
**Solution**: Make sure you ran the SQL script after signing up

**Issue**: Parent portal shows 404
**Solution**: 
1. Check the URL is correct: `/dashboard/parent/dashboard`
2. Make sure you're logged in
3. Clear browser cache and reload

**Issue**: Can't see navigation items for my role
**Solution**: 
1. Log out and log back in
2. Check role in database:
```sql
SELECT email, role FROM auth.users u 
JOIN user_schools us ON us.user_id = u.id;
```

---

## 📱 Mobile Testing

Parent Portal is **mobile-first**, so test it on:
- iPhone Safari (responsive design)
- Android Chrome
- Or resize your browser to mobile view (375px width)

---

**Next**: After creating test accounts, you can demo the full system with different user experiences! 🎉




