Feature: Homepage Widgets - Validation and Data Consistency

  Background:
    Given User logs in to the Americold Compass application with valid credentials
    Then Home page should be displayed '<homepageTitle>' 
    Examples:
      | homepageTitle          |
      | generic |

@homepage-widgets @regression @amcc-tc-6844
  Scenario Outline: AMCC-TC-6844 Validation of Widget Layout
  #   When Verify Quick Actions widget is displayed with action buttons for '<inputdata>'
  #   And Verify layout remains consistent across different users and action counts
  #   Then Widget layout should remain consistent
  # Examples:
  #   | inputdata   |
  #   | AMCC-TC-6844 |

  @homepage-widgets @regression @amcc-tc-6843
  Scenario Outline: AMCC-TC-6843 Validation of widget when no action config is available
  #   When Quick Actions has no configured actions for '<inputdata>'
  #   Then Quick Actions widget should not be displayed on the homepage
  # Examples:
  #   | inputdata   |
  #   | AMCC-TC-6843 |

  @homepage-widgets @regression @amcc-tc-6842
  Scenario Outline: AMCC-TC-6842 Verifying the functionality of the ellipsis button
  #   When Verify Quick Actions widget displays more than 5 actions for '<inputdata>'
  #   And Click the ellipsis
  #   Then Additional quick action options should be displayed
  # Examples:
  #   | inputdata   |
  #   | AMCC-TC-6842 |

  @homepage-widgets @regression @amcc-tc-6841
  Scenario Outline: AMCC-TC-6841 Verifying that ellipsis is not displayed when quick actions <= 5
  #   When Verify Quick Actions widget displays 5 actions for '<inputdata>'
  #   Then Ellipsis should not be displayed
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-6841 |

  @homepage-widgets @regression @amcc-tc-6840
  Scenario Outline: AMCC-TC-6840 Verifying that ellipsis is displayed when quick actions > 5
  #   When Verify Quick Actions widget displays > 5 actions for '<inputdata>'
  #   Then Ellipsis should be displayed at the right end of the Quick Actions widget
  # Examples:
  #   | inputdata  |
  #   | AMCC-TC-6840 |

   @homepage-widgets @regression @amcc-tc-6838
  Scenario Outline: AMCC-TC-6838 Validation of Action buttons
  #   When Verify Quick Actions widget is displayed with action buttons for '<inputdata>'
  #   And Click any action button
  #   Then The action button should be clickable and redirect the user to the respective module
  # Examples:
  #   | inputdata   |
  #   | AMCC-TC-6838 |
