/**
 * scripts/seed-demo.mjs
 *
 * Populates MongoDB with demo records for CamPulse:
 * - Departments & Academic Years
 * - HODs (HOD101 / hod123)
 * - Faculty Staff (STAFF101 / staff123)
 * - Students (2023CS001 / student123, 2023CS002 / student123)
 * - Class coordinator mappings
 * - Broadcast notices
 * - Event proposals
 * - Sample activities
 *
 * Usage:
 *   node scripts/seed-demo.mjs
 */

import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import nextEnv from '@next/env';
import { configureMongoDns } from '../lib/mongodb-dns.mjs';

nextEnv.loadEnvConfig(process.cwd());
configureMongoDns();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campulse';
const dbName = process.env.MONGODB_DB || 'campulse';

async function seed() {
  console.log(`\n🌱 Seeding CamPulse Demo Data into MongoDB...`);
  console.log(`📁 Database: ${dbName}\n`);

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);

    // Demo setup is only for an empty database. Never erase existing records.
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const collection of collections) {
      if (await db.collection(collection.name).findOne({}, { projection: { _id: 1 } })) {
        throw new Error(`Database "${dbName}" already contains data. Demo setup stopped to preserve it.`);
      }
    }

    // Hash passwords
    const studentPasswordHash = await bcrypt.hash('student123', 10);
    const staffPasswordHash = await bcrypt.hash('staff123', 10);
    const hodPasswordHash = await bcrypt.hash('hod123', 10);

    // 1. Departments
    console.log('Inserting departments...');
    await db.collection('departments').insertMany([
      { department_id: '101', department_name: 'Computer Engineering' },
      { department_id: '102', department_name: 'Information Technology' },
      { department_id: '103', department_name: 'Mechanical Engineering' },
      { department_id: '104', department_name: 'Electronics & Telecommunication' },
    ]);

    // 2. Academic Years
    console.log('Inserting academic years...');
    await db.collection('academic_years').insertMany([
      { year_id: '1', year_name: 'First Year (FE)' },
      { year_id: '2', year_name: 'Second Year (SE)' },
      { year_id: '3', year_name: 'Third Year (TE)' },
      { year_id: '4', year_name: 'Final Year (BE)' },
    ]);

    // 3. HODs
    console.log('Inserting HODs...');
    await db.collection('hods').insertMany([
      {
        huid: 'HOD101',
        name: 'Dr. Rajesh Sharma',
        email: 'hod.comp@kkw.edu',
        department_id: '101',
        password: hodPasswordHash,
        created_at: new Date().toISOString(),
      },
    ]);

    // 4. Staff / Faculty
    console.log('Inserting faculty staff...');
    await db.collection('staff').insertMany([
      {
        suid: 'STAFF101',
        name: 'Prof. Anjali Mehta',
        email: 'anjali.mehta@kkw.edu',
        department_id: '101',
        designation: 'Assistant Professor & Class Coordinator',
        password: staffPasswordHash,
        created_at: new Date().toISOString(),
      },
      {
        suid: 'STAFF102',
        name: 'Dr. Vikram Deshmukh',
        email: 'vikram.deshmukh@kkw.edu',
        department_id: '101',
        designation: 'Associate Professor',
        password: staffPasswordHash,
        created_at: new Date().toISOString(),
      },
    ]);

    // 5. Class Coordinators
    console.log('Mapping class coordinators...');
    await db.collection('class_coordinators').insertMany([
      { suid: 'STAFF101', division: 'A' },
      { suid: 'STAFF102', division: 'B' },
    ]);

    // 6. Students
    console.log('Inserting students...');
    await db.collection('students').insertMany([
      {
        uid: '2023CS001',
        name: 'Aarav Patel',
        email: 'aarav.patel@kkw.edu',
        department_id: '101',
        year_id: '3',
        division: 'A',
        batch: '2023-2027',
        password: studentPasswordHash,
        created_at: new Date().toISOString(),
      },
      {
        uid: '2023CS002',
        name: 'Isha Verma',
        email: 'isha.verma@kkw.edu',
        department_id: '101',
        year_id: '3',
        division: 'A',
        batch: '2023-2027',
        password: studentPasswordHash,
        created_at: new Date().toISOString(),
      },
      {
        uid: '2023CS003',
        name: 'Rohan Joshi',
        email: 'rohan.joshi@kkw.edu',
        department_id: '101',
        year_id: '3',
        division: 'B',
        batch: '2023-2027',
        password: studentPasswordHash,
        created_at: new Date().toISOString(),
      },
    ]);

    // 7. Group Activities
    console.log('Inserting activities & participants...');

    const act1Id = 'ACT-2026-001';
    const act2Id = 'ACT-2026-002';

    await db.collection('group_activities').insertMany([
      {
        id: act1Id,
        title: 'Smart India Hackathon 2026 Grand Finale',
        category: 'Technical',
        description: 'Developed an AI-driven disaster relief routing system, awarded 2nd prize.',
        start_date: '2026-09-10',
        end_date: '2026-09-12',
        leave_required: true,
        created_by: '2023CS001',
        created_at: new Date('2026-09-15').toISOString(),
      },
      {
        id: act2Id,
        title: 'National Level Technical Paper Presentation',
        category: 'Technical',
        description: 'Published research on lightweight deep learning inference architectures.',
        start_date: '2026-10-05',
        end_date: '2026-10-06',
        leave_required: false,
        created_by: '2023CS002',
        created_at: new Date('2026-10-08').toISOString(),
      },
    ]);

    await db.collection('activity_participants').insertMany([
      { activity_id: act1Id, student_uid: '2023CS001', status: 'Approved' },
      { activity_id: act1Id, student_uid: '2023CS002', status: 'Approved' },
      { activity_id: act2Id, student_uid: '2023CS002', status: 'Pending' },
    ]);

    await db.collection('activity_mentors').insertMany([
      { activity_id: act1Id, staff_suid: 'STAFF101' },
      { activity_id: act2Id, staff_suid: 'STAFF101' },
    ]);

    // 8. Event Proposals
    console.log('Inserting event proposals...');
    await db.collection('event_proposals').insertMany([
      {
        id: 'PROP-2026-101',
        title: 'HackPulse 24-Hour Inter-College Hackathon',
        event_type: 'Hackathon',
        club_name: 'CSI Student Chapter',
        description: 'Annual hackathon bringing 50+ college teams for AI and Systems innovation.',
        start_date: '2026-11-15T09:00',
        end_date: '2026-11-16T12:00',
        venue: 'Main Auditorium & Labs 1-4',
        expected_footfall: 250,
        estimated_budget: 35000,
        teacher_coordinator: 'Prof. Anjali Mehta',
        status: 'Approved',
        department_id: '101',
        created_by: '2023CS001',
        created_at: new Date('2026-10-01').toISOString(),
      },
      {
        id: 'PROP-2026-102',
        title: 'Workshop on Cloud Native Microservices with Docker & K8s',
        event_type: 'Workshop',
        club_name: 'DevOps Club',
        description: 'Hands-on practical session on containerization, CI/CD, and Kubernetes orchestration.',
        start_date: '2026-11-20T10:00',
        end_date: '2026-11-20T17:00',
        venue: 'Lab 5, 2nd Floor',
        expected_footfall: 80,
        estimated_budget: 8000,
        teacher_coordinator: 'Prof. Anjali Mehta',
        status: 'Pending',
        department_id: '101',
        created_by: 'STAFF101',
        created_at: new Date('2026-10-20').toISOString(),
      },
    ]);

    // 9. Broadcast Notices
    console.log('Inserting broadcasts...');
    await db.collection('broadcasts').insertMany([
      {
        id: 'BC-2026-001',
        title: 'Upcoming TechFest 2026 Registration & Activity Submissions',
        message: 'All students are requested to register and log their event participations through CamPulse before November 10th.',
        target_audience: 'all',
        department_id: '101',
        created_by: 'HOD101',
        has_rsvp: false,
        created_at: new Date().toISOString(),
      },
      {
        id: 'BC-2026-002',
        title: 'Faculty Coordination Meeting on Friday',
        message: 'Department meeting regarding mid-term activity evaluations in Conference Room B at 3:30 PM.',
        target_audience: 'staff',
        department_id: '101',
        created_by: 'HOD101',
        has_rsvp: true,
        created_at: new Date().toISOString(),
      },
    ]);

    console.log('\n🎉 Demo Data Seeded Successfully!\n');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('🔑 DEMO LOGIN CREDENTIALS:');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('1. Student:');
    console.log('   UID:      2023CS001');
    console.log('   Password: student123');
    console.log('   Portal:   /student\n');
    console.log('2. Faculty / Staff:');
    console.log('   UID:      STAFF101');
    console.log('   Password: staff123');
    console.log('   Portal:   /staff\n');
    console.log('3. Head of Department (HOD):');
    console.log('   UID:      HOD101');
    console.log('   Password: hod123');
    console.log('   Portal:   /hod');
    console.log('─────────────────────────────────────────────────────────────────\n');
  } catch (err) {
    console.error('❌ Error seeding demo data:', err.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

seed();
