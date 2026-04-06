-- =============================================
-- 028: Library Management
-- =============================================

-- Book catalog
CREATE TABLE IF NOT EXISTS library_books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    isbn TEXT,
    title TEXT NOT NULL,
    author TEXT,
    publisher TEXT,
    category TEXT DEFAULT 'general',
    subject_id UUID REFERENCES subjects(id),
    edition TEXT,
    publication_year INT,
    total_copies INT DEFAULT 1 CHECK (total_copies >= 0),
    available_copies INT DEFAULT 1 CHECK (available_copies >= 0),
    shelf_location TEXT,
    cover_image_url TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_books_school ON library_books(school_id);
CREATE INDEX IF NOT EXISTS idx_library_books_isbn ON library_books(isbn);
CREATE INDEX IF NOT EXISTS idx_library_books_category ON library_books(school_id, category);

-- Borrowing / issue records
CREATE TABLE IF NOT EXISTS library_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
    borrower_type TEXT NOT NULL CHECK (borrower_type IN ('student', 'teacher', 'staff')),
    student_id UUID REFERENCES students(id),
    employee_id UUID REFERENCES employees(id),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    return_date DATE,
    status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'returned', 'overdue', 'lost')),
    fine_amount NUMERIC(10, 2) DEFAULT 0,
    fine_paid BOOLEAN DEFAULT false,
    notes TEXT,
    issued_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_tx_school ON library_transactions(school_id);
CREATE INDEX IF NOT EXISTS idx_library_tx_book ON library_transactions(book_id);
CREATE INDEX IF NOT EXISTS idx_library_tx_student ON library_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_library_tx_status ON library_transactions(status);

-- RLS
ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "library_books_school_access" ON library_books
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );

CREATE POLICY "library_transactions_school_access" ON library_transactions
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );
