cmake_minimum_required(VERSION 3.15)

project(RobBobNetNative LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build the engine DLL/shared library
add_subdirectory(RobBobNetEngine)

# Build the service executable that links against the engine
add_subdirectory(RobBobNetService)

