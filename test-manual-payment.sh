#!/bin/bash

echo "🚀 Starting Manual Payment System Test..."
echo ""

# Start dev server in background
echo "Starting dev server..."
npm run dev > /dev/null 2>&1 &
DEV_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
sleep 10

# Check if server is running
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Server is running"
else
    echo "❌ Server failed to start"
    kill $DEV_PID 2>/dev/null
    exit 1
fi

echo ""
echo "🧪 Running Playwright tests..."
echo ""

# Run the manual payment tests
npx playwright test tests/admin/products-manual-payment.spec.ts --headed

TEST_RESULT=$?

# Cleanup
echo ""
echo "Stopping dev server..."
kill $DEV_PID 2>/dev/null

if [ $TEST_RESULT -eq 0 ]; then
    echo ""
    echo "✅ All tests passed!"
else
    echo ""
    echo "❌ Some tests failed"
fi

exit $TEST_RESULT
