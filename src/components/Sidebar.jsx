export default function Sidebar({ notesCount, courseCounts, selectedCourse, onCourseClick }) {
  return (
    <div className="sidebar">
      <h3>Courses</h3>
      <ul>
        <li className={!selectedCourse || selectedCourse === 'all' ? 'active' : ''} onClick={() => onCourseClick('all')}>All Courses ({notesCount})</li>
        {Object.entries(courseCounts).map(([course, count]) => (
          <li key={course} className={selectedCourse === course ? 'active' : ''} onClick={() => onCourseClick(course)}>
            {course} ({count})
          </li>
        ))}
      </ul>
    </div>
  );
}