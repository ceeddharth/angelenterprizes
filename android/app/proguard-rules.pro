# ProGuard rules for Civil Workforce Attendance System
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Firebase & Coroutines
-dontwarn com.google.firebase.**
-keep class com.google.firebase.** { *; }
-keepclassmembers class * {
    @com.google.firebase.firestore.PropertyName <fields>;
    @com.google.firebase.firestore.PropertyName <methods>;
}

# Keep Data Models
-keep class com.civilworkforce.attendance.model.** { *; }

# Room Database
-keep class * extends androidx.room.RoomDatabase
-keep class * extends androidx.room.RoomDatabase$Callback
-dontwarn androidx.room.paging.**

# Coil Image Loader
-keep class coil.** { *; }
-dontwarn coil.**

# ML Kit Barcode Scanning
-keep class com.google.mlkit.vision.barcode.** { *; }
